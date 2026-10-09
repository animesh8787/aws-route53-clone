"""Development seed / reset command: ``python -m app.seed [--reset]``."""
import argparse
import logging
import threading
from datetime import datetime, timedelta

from sqlalchemy import create_engine, func, insert, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.ids import new_id
from app.core.security import hash_password
from app.db.session import Base, SessionLocal, engine
from app.models import ActivityEvent, DnsRecord, HealthCheck, HostedZone, Resource, User, VpcAssociation
from app.schemas.hosted_zone import HostedZoneCreate, VpcIn
from app.schemas.record import AliasIn, RecordIn
from app.services import record_service, zone_extras, zone_service
from app.services.resources import service as resource_service
from app.services.resources.registry import get_kind

logger = logging.getLogger("route53.seed")

_ID_STATE: dict = {"stable": True, "cache": {}}


def ids(fixed: str) -> str:
    """The demo account keeps readable, stable IDs; sample data in other accounts gets fresh ones (IDs are globally unique)."""
    if _ID_STATE["stable"]:
        return fixed
    cache = _ID_STATE["cache"]
    if fixed not in cache:
        cache[fixed] = zone_service.generate_zone_id() if "-" not in fixed else new_id(fixed.rsplit("-", 1)[0])
    return cache[fixed]

DEMO_ZONES = [
    ("example.com", "public", "Primary production domain", "Z04512872OH7L5Q4YLRPT"),
    ("mycompany.dev", "public", "Company engineering sandbox", "Z0891234KX2QWERT7HGFD"),
    ("internal.local", "private", "Internal service discovery", "Z1R8UBAEXAMPLE6PRIV"),
    ("shop.example.com", "public", "Storefront subdomain", "Z09876543NMBVCXZLKJH1"),
]
FILLER = [
    "acme-corp.io", "blog.example.org", "cdn.example.net", "docs.mycompany.dev", "staging.example.com",
    "api.example.io", "mail.example.co", "status.example.org", "intranet.corp", "dev.internal.local",
    "analytics.example.net", "assets.example.com", "billing.example.io", "careers.example.org",
    "learn.example.edu", "partners.example.com", "support.example.io", "labs.mycompany.dev",
]  # fmt: skip


def _add(db: Session, zone: HostedZone, name: str, rtype: str, values: list[str] | None = None, ttl: int | None = 300, **kw) -> None:
    alias = kw.pop("alias", None)
    payload = RecordIn(name=name, type=rtype, ttl=None if alias else ttl, values=values or [], alias=alias, **kw)
    record_service.create_record(db, zone, payload)


def ensure_user(db: Session) -> User:
    settings = get_settings()
    user = db.scalar(select(User).where(User.email == settings.demo_email))
    if user is None:
        user = User(email=settings.demo_email, password_hash=hash_password(settings.demo_password), display_name="demo-user")
        db.add(user)
        db.commit()
    return user


DEMO_HEALTH_CHECKS = [
    # public id, name, type, endpoint, port, path, status
    ("hc-0a1b2c3d4e5f6a7b8", "web-primary", "HTTPS", "203.0.113.10", 443, "/health", "HEALTHY"),
    ("hc-1b2c3d4e5f6a7b8c9", "web-secondary", "HTTP", "203.0.113.20", 80, "/", "HEALTHY"),
    ("hc-2c3d4e5f6a7b8c9d0", "api-eu", "TCP", "api-eu.example.com", 443, "", "UNHEALTHY"),
]


def seed_health_checks(db: Session, owner_id: int) -> None:
    now = datetime.utcnow().isoformat(timespec="seconds")
    for hc_id, name, hc_type, endpoint, port, path, status in DEMO_HEALTH_CHECKS:
        if db.scalar(select(HealthCheck).where(HealthCheck.health_check_id == hc_id)) is None:
            db.add(HealthCheck(
                owner_id=owner_id, health_check_id=ids(hc_id), name=name, type=hc_type, endpoint=endpoint, port=port, path=path,
                status=status, regions=[], history=[{"status": status, "at": now, "note": "Seeded"}],
            ))  # fmt: skip
    db.commit()


def _seed_example(db: Session, zone: HostedZone) -> None:
    _add(db, zone, "@", "A", ["192.0.2.10"], ttl=300)
    _add(db, zone, "@", "AAAA", ["2001:db8::10"])
    _add(db, zone, "@", "MX", ["10 mail.example.com", "20 backup-mail.example.com"], ttl=3600)
    _add(db, zone, "@", "TXT", ['"v=spf1 include:_spf.example.com ~all"', '"google-site-verification=abc123XYZ"'], ttl=300)
    _add(db, zone, "@", "CAA", ['0 issue "letsencrypt.org"', '0 issuewild ";"', '0 iodef "mailto:security@example.com"'], ttl=3600)
    _add(db, zone, "www", "CNAME", ["example.com"], ttl=300)
    _add(db, zone, "mail", "A", ["192.0.2.25"])
    _add(db, zone, "_sip._tcp", "SRV", ["10 60 5060 sip.example.com", "20 40 5060 sip-backup.example.com"], ttl=3600)
    _add(db, zone, "_dmarc", "TXT", ['"v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"'], ttl=3600)
    _add(db, zone, "dev", "NS", ["ns-1.awsdns-01.com", "ns-2.awsdns-02.net"], ttl=172800)
    _add(db, zone, "mail-ptr", "PTR", ["mail.example.com"], ttl=3600)
    _add(db, zone, "cdn", "A", alias=AliasIn(target="d111111abcdef8.cloudfront.net", target_type="cloudfront"))
    _add(db, zone, "app", "A", alias=AliasIn(target="my-alb-123456.us-east-1.elb.amazonaws.com", target_type="elb", evaluate_target_health=True))
    _add(db, zone, "static", "A", alias=AliasIn(target="s3-website-us-east-1.amazonaws.com", target_type="s3-website"))
    # weighted
    _add(db, zone, "blue", "A", ["198.51.100.1"], routing_policy="weighted", set_identifier="blue-70", weight=70)
    _add(db, zone, "blue", "A", ["198.51.100.2"], routing_policy="weighted", set_identifier="green-30", weight=30)
    # latency
    _add(db, zone, "latency", "A", ["203.0.113.1"], routing_policy="latency", set_identifier="us-east", region="us-east-1")
    _add(db, zone, "latency", "A", ["203.0.113.2"], routing_policy="latency", set_identifier="eu-west", region="eu-west-1")
    _add(db, zone, "latency", "A", ["203.0.113.3"], routing_policy="latency", set_identifier="ap-south", region="ap-southeast-1")
    # failover (health-checked)
    _add(
        db, zone, "failover", "A", ["203.0.113.10"],
        routing_policy="failover", set_identifier="primary", failover="PRIMARY", health_check_id=ids("hc-0a1b2c3d4e5f6a7b8"),
    )  # fmt: skip
    _add(db, zone, "failover", "A", ["203.0.113.99"], routing_policy="failover", set_identifier="secondary", failover="SECONDARY")
    # geolocation
    _add(db, zone, "geo", "A", ["203.0.113.50"], routing_policy="geolocation", set_identifier="default", geo_country="*")
    _add(db, zone, "geo", "A", ["203.0.113.51"], routing_policy="geolocation", set_identifier="europe", geo_continent="EU")
    _add(db, zone, "geo", "A", ["203.0.113.52"], routing_policy="geolocation", set_identifier="us-ca", geo_country="US", geo_subdivision="CA")
    # multivalue
    for i, ip in enumerate(["203.0.113.61", "203.0.113.62", "203.0.113.63"], start=1):
        _add(db, zone, "pool", "A", [ip], ttl=60, routing_policy="multivalue", set_identifier=f"node-{i}")
    _add(db, zone, "api-eu", "A", ["203.0.113.70"], routing_policy="multivalue", set_identifier="api-eu-1", health_check_id=ids("hc-2c3d4e5f6a7b8c9d0"))
    for sub in ("api", "auth", "blog", "docs", "status", "grafana", "git", "ci"):
        _add(db, zone, sub, "CNAME", [f"{sub}-lb.example.net"])


def _seed_simple(db: Session, zone: HostedZone, host_ip: str) -> None:
    _add(db, zone, "@", "A", [host_ip])
    _add(db, zone, "www", "CNAME", [zone.name])
    _add(db, zone, "@", "TXT", ['"v=spf1 -all"'])
    _add(db, zone, "@", "MX", ["10 mx1." + zone.name])


def _build_demo_data(db: Session, owner_id: int) -> None:  # noqa: D401
    """Create the demo zones/records through the normal services (full validation)."""
    seed_health_checks(db, owner_id)
    for name, kind, comment, zone_id in DEMO_ZONES:
        vpc = VpcIn(vpc_id="vpc-0a1b2c3d4e5f60789", region="us-east-1") if kind == "private" else None
        zone = zone_service.create_zone(db, HostedZoneCreate(name=name, type=kind, comment=comment, vpc=vpc), created_by="demo-user", zone_id=ids(zone_id), owner_id=owner_id)
        if name == "example.com":
            _seed_example(db, zone)
        elif name == "internal.local":
            _add(db, zone, "db", "A", ["10.0.1.15"], ttl=60)
            _add(db, zone, "cache", "A", ["10.0.1.16"], ttl=60)
            _add(db, zone, "queue", "CNAME", ["db.internal.local"])
            _add(db, zone, "_ldap._tcp", "SRV", ["0 100 389 ldap.internal.local"])
            _add(db, zone, "db-ptr", "PTR", ["db.internal.local"])
        elif name == "shop.example.com":
            _seed_simple(db, zone, "192.0.2.80")
            _add(db, zone, "checkout", "A", alias=AliasIn(target="shop-alb-99.us-east-1.elb.amazonaws.com", target_type="elb"))
        else:
            _seed_simple(db, zone, "198.51.100.25")
    for index, name in enumerate(FILLER):
        zone = zone_service.create_zone(
            db, HostedZoneCreate(name=name, type="private" if name.endswith((".corp", ".local")) else "public", comment=f"Demo zone {index + 1}",
                                 vpc=VpcIn(vpc_id="vpc-0a1b2c3d4e5f60789", region="us-east-1") if name.endswith((".corp", ".local")) else None),
            created_by="demo-user", owner_id=owner_id,
        )
        _seed_simple(db, zone, f"203.0.113.{index + 100}")
    _seed_console_resources(db, owner_id)


def _seed_console_resources(db: Session, owner_id: int) -> None:
    """Demo data for the console pages that are not DNS zones: CIDR collections, traffic policies, profiles..."""
    kind = get_kind
    example = db.scalar(select(HostedZone).where(HostedZone.name == "example.com"))
    cidr = resource_service.create(
        db, owner_id, kind("cidr_collection"),
        {"name": "office-networks", "locations": [
            {"name": "london", "cidr_blocks": ["203.0.113.0/24", "2001:db8:a::/48"]},
            {"name": "paris", "cidr_blocks": ["198.51.100.0/24"]},
            {"name": "singapore", "cidr_blocks": ["192.0.2.0/26"]},
        ]},
        public_id=ids("cidr-0a1b2c3d4e5f6a7b8"),
    )  # fmt: skip
    _add(db, example, "geoip", "A", ["198.18.0.1"], routing_policy="ipbased", set_identifier="london", cidr_collection_id=cidr.public_id, cidr_location="london")
    _add(db, example, "geoip", "A", ["198.18.0.2"], routing_policy="ipbased", set_identifier="paris", cidr_collection_id=cidr.public_id, cidr_location="paris")
    _add(db, example, "geoip", "A", ["198.18.0.99"], routing_policy="ipbased", set_identifier="default", cidr_collection_id=cidr.public_id, cidr_location="*")

    failover = {
        "AWSPolicyFormatVersion": "2015-10-01", "RecordType": "A", "StartRule": "main",
        "Endpoints": {"primary": {"Type": "value", "Value": "198.51.100.10"}, "standby": {"Type": "value", "Value": "198.51.100.20"}},
        "Rules": {"main": {"RuleType": "failover", "Primary": {"EndpointReference": "primary", "HealthCheck": ids("hc-0a1b2c3d4e5f6a7b8")}, "Secondary": {"EndpointReference": "standby"}}},
    }  # fmt: skip
    weighted = {
        "RecordType": "A", "StartRule": "split",
        "Endpoints": {"blue": {"Type": "value", "Value": "198.51.100.31"}, "green": {"Type": "value", "Value": "198.51.100.32"}},
        "Rules": {"split": {"RuleType": "weighted", "Items": [{"EndpointReference": "blue", "Weight": 90}, {"EndpointReference": "green", "Weight": 10}]}},
    }  # fmt: skip
    policy = resource_service.create(
        db, owner_id, kind("traffic_policy"), {"name": "web-failover", "record_type": "A", "description": "Primary with standby", "document": failover},
        public_id=ids("tp-0a1b2c3d4e5f6a7b8"),
    )  # fmt: skip
    resource_service.create(db, owner_id, kind("traffic_policy"), {"name": "canary-release", "record_type": "A", "description": "90/10 split", "document": weighted})
    resource_service.create(
        db, owner_id, kind("policy_record"),
        {"zone_id": example.zone_id, "dns_name": "policy", "policy_id": policy.public_id, "policy_version": 1, "ttl": 60},
    )  # fmt: skip
    contact = {
        "first_name": "Demo", "last_name": "User", "organization": "Demo Company", "email": "demo@example.com", "phone": "+1 206 555 0100",
        "address_line": "410 Terry Ave N", "city": "Seattle", "state": "WA", "zip_code": "98109", "country": "US",
    }  # fmt: skip
    resource_service.create(db, owner_id, kind("domain"), {"name": "mycompany.dev", "years": 2, "contact": contact}, public_id=ids("dom-0a1b2c3d4e5f6a7b8"))
    expiring = resource_service.create(db, owner_id, kind("domain"), {"name": "acme-corp.io", "years": 1, "auto_renew": False, "transfer_lock": False, "contact": contact})
    expiring.data = {**expiring.data, "expires_at": (datetime.utcnow() + timedelta(days=25)).isoformat(timespec="seconds")}
    db.commit()
    zone_extras.set_tags(db, example, [zone_extras.Tag(key="Environment", value="production"), zone_extras.Tag(key="Team", value="platform"), zone_extras.Tag(key="CostCenter", value="CC-1042")])
    mycompany = db.scalar(select(HostedZone).where(HostedZone.name == "mycompany.dev"))
    zone_extras.enable_dnssec(db, mycompany, zone_extras.DnssecEnable(ksk_name="mycompany_ksk"))
    internal = db.scalar(select(HostedZone).where(HostedZone.name == "internal.local"))
    prod = "vpc-0a1b2c3d4e5f60789"
    ips = lambda a, b: [{"subnet_id": "subnet-0a1b2c3d4e", "ip": a}, {"subnet_id": "subnet-0b2c3d4e5f", "ip": b}]  # noqa: E731
    resource_service.create(
        db, owner_id, kind("resolver_inbound"),
        {"name": "corp-inbound", "vpc_id": prod, "security_group_ids": ["sg-0a1b2c3d4e5f6a7b8"], "protocols": ["Do53"], "ip_addresses": ips("10.0.1.10", "10.0.2.10")},
        public_id=ids("rslvr-in-0a1b2c3d4e5f6a7b8"),
    )  # fmt: skip
    outbound = resource_service.create(
        db, owner_id, kind("resolver_outbound"),
        {"name": "corp-outbound", "vpc_id": prod, "security_group_ids": ["sg-0a1b2c3d4e5f6a7b8"], "protocols": ["Do53"], "ip_addresses": ips("10.0.1.20", "10.0.2.20")},
        public_id=ids("rslvr-out-0a1b2c3d4e5f6a7b8"),
    )  # fmt: skip
    rule = resource_service.create(
        db, owner_id, kind("resolver_rule"),
        {"name": "forward-corp", "rule_type": "FORWARD", "domain_name": "corp.example.net", "outbound_endpoint_id": outbound.public_id,
         "target_ips": [{"ip": "10.0.1.53", "port": 53}, {"ip": "10.0.2.53", "port": 53}], "vpc_ids": [prod]},
    )  # fmt: skip
    qlog = resource_service.create(
        db, owner_id, kind("query_logging"),
        {"name": "resolver-query-logs", "destination_type": "cloudwatch-logs", "destination_arn": "arn:aws:logs:us-east-1:123456789012:log-group:/route53/resolver-queries", "vpc_ids": [prod]},
    )  # fmt: skip
    blocked = resource_service.create(
        db, owner_id, kind("fw_domain_list"),
        {"name": "blocked-domains", "domains": ["malware.example.org", "*.phishing.example.org", "tracker.example.net"]},
        public_id=ids("rslvr-fdl-0a1b2c3d4e5f6a7b8"),
    )  # fmt: skip
    resource_service.create(db, owner_id, kind("fw_domain_list"), {"name": "allowed-partners", "domains": ["partner.example.com", "*.cdn.example.com"]})
    group = resource_service.create(
        db, owner_id, kind("fw_rule_group"),
        {"name": "baseline-firewall", "description": "Blocks known bad domains", "associations": [{"vpc_id": prod, "priority": 200}],
         "rules": [{"name": "block-malware", "priority": 10, "domain_list_id": blocked.public_id, "action": "BLOCK", "block_response": "NXDOMAIN"}]},
    )  # fmt: skip
    resource_service.create(
        db, owner_id, kind("profile"),
        {"name": "production-dns", "description": "DNS settings shared by production VPCs", "vpc_ids": [prod], "zone_ids": [internal.zone_id],
         "resource_ids": [rule.public_id, qlog.public_id, group.public_id]},
    )  # fmt: skip
    resource_service.create(
        db, owner_id, kind("global_resolver"),
        {"name": "corp-global-resolver", "description": "Anycast resolver for branch offices", "observability_region": "us-east-1",
         "regions": ["us-east-1", "eu-west-1", "ap-south-1"], "ip_address_type": "DUALSTACK"},
        public_id=ids("gr-0a1b2c3d4e5f6a7b8"),
    )  # fmt: skip
    resource_service.create(
        db, owner_id, kind("resolver_outpost"),
        {"name": "factory-outpost-resolver", "outpost_arn": "arn:aws:outposts:us-east-1:123456789012:outpost/op-0a1b2c3d4e5f60789", "instance_count": 4, "preferred_instance_type": "m5.large"},
        public_id=ids("rslvr-op-0a1b2c3d4e5f6a7b8"),
    )  # fmt: skip
    # Shared DNS views come from another account through AWS RAM, so they are inserted directly rather than "created".
    db.add(
        Resource(
            owner_id=owner_id, kind="shared_dns_view", public_id=ids("dnsview-0a1b2c3d4e5f6a7b8"), name="partner-shared-view", status="ACTIVE",
            data={"name": "partner-shared-view", "description": "Split-horizon view shared by the networking account", "owner_account_id": "111122223333",
                  "dnssec_validation": True, "edns_client_subnet": False, "firewall_fail_open": False},
        )
    )  # fmt: skip
    db.commit()


_COPY_ORDER = (HealthCheck, HostedZone, VpcAssociation, DnsRecord, Resource)
_CHUNK = 100


def _seed_activity(db: Session, owner_id: int) -> None:
    """A few past events so the notifications list is not empty on a fresh deployment."""
    now = datetime.utcnow()
    example = db.scalar(select(HostedZone).where(HostedZone.owner_id == owner_id, HostedZone.name == "example.com"))
    events = [
        (2, "created", "Hosted zone", "example.com", f"/hosted-zones/{example.zone_id}" if example else "/hosted-zones", ""),
        (5, "created", "Domain", "mycompany.dev", "/registered-domains", ""),
        (9, "updated", "Health check", "api-eu", "/health-checks", "Status is now unhealthy"),
        (30, "created", "Traffic policy", "web-failover", "/traffic-policies", ""),
        (55, "imported", "Zone file", "12 record(s) into shop.example.com", "/hosted-zones", ""),
        (180, "created", "Rule group", "baseline-firewall", "/dns-firewall", ""),
    ]
    for minutes, action, kind, name, href, detail in events:
        db.add(ActivityEvent(owner_id=owner_id, action=action, resource_type=kind, resource_name=name, href=href, detail=detail, is_read=minutes > 40, created_at=now - timedelta(minutes=minutes)))
    db.commit()


_FOREIGN_KEYS = {DnsRecord: {"hosted_zone_id": HostedZone, "health_check_id": HealthCheck}, VpcAssociation: {"hosted_zone_id": HostedZone}}
_POPULATE_LOCK = threading.Lock()


def populate(db: Session, owner_id: int, *, stable_ids: bool) -> None:
    """Build the sample dataset for ``owner_id`` and copy it into ``db``.

    The data is built in a throw-away in-memory SQLite database (so every record goes through the
    real validation rules) and then copied with a handful of bulk INSERTs in one transaction. A
    remote database such as Turso charges a network round trip per statement, so seeding
    record-by-record there takes minutes and can leave half a dataset. Primary keys are shifted
    past the existing maximum so the copy is safe in a database that already holds other accounts.
    """
    with _POPULATE_LOCK:
        _ID_STATE.update(stable=stable_ids, cache={})
        scratch = create_engine("sqlite://")
        Base.metadata.create_all(scratch)
        with Session(scratch) as mem:
            _build_demo_data(mem, owner_id)
            mem.commit()
            rows = {m: [dict(r._mapping) for r in mem.execute(m.__table__.select())] for m in _COPY_ORDER}
        _ID_STATE.update(stable=True, cache={})

    offsets = {m: db.scalar(select(func.max(m.id))) or 0 for m in _COPY_ORDER}
    for model in _COPY_ORDER:
        for row in rows[model]:
            row["id"] += offsets[model]
            for column, parent in _FOREIGN_KEYS.get(model, {}).items():
                if row[column] is not None:
                    row[column] += offsets[parent]
        for start in range(0, len(rows[model]), _CHUNK):
            db.execute(insert(model.__table__).values(rows[model][start : start + _CHUNK]))
    db.commit()
    _seed_activity(db, owner_id)


def seed_all(db: Session) -> None:
    """Seed the demo account once (it keeps stable IDs, so documentation and tests can refer to them)."""
    demo = ensure_user(db)
    if db.scalar(select(HostedZone.id).where(HostedZone.owner_id == demo.id).limit(1)) is not None:
        return
    populate(db, demo.id, stable_ids=True)
    logger.info("Seeded demo data.")


def reset_db() -> None:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Route 53 clone database.")
    parser.add_argument("--reset", action="store_true", help="drop and recreate all tables first")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    if args.reset:
        reset_db()
    else:
        Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_all(db)


if __name__ == "__main__":
    main()
