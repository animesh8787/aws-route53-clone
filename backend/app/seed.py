"""Development seed / reset command: ``python -m app.seed [--reset]``."""
import argparse
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import Base, SessionLocal, engine
from app.models import HealthCheck, HostedZone, User
from app.schemas.hosted_zone import HostedZoneCreate, VpcIn
from app.schemas.record import AliasIn, RecordIn
from app.services import record_service, zone_service

logger = logging.getLogger("route53.seed")

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


def ensure_user(db: Session) -> None:
    settings = get_settings()
    if db.scalar(select(User).where(User.email == settings.demo_email)) is None:
        db.add(User(email=settings.demo_email, password_hash=hash_password(settings.demo_password), display_name="demo-user"))
        db.commit()


def seed_health_checks(db: Session) -> None:
    for hc_id, name, target, status in [
        ("hc-0a1b2c3d4e5f6a7b8", "web-primary", "203.0.113.10:443", "HEALTHY"),
        ("hc-1b2c3d4e5f6a7b8c9", "web-secondary", "203.0.113.20:443", "HEALTHY"),
        ("hc-2c3d4e5f6a7b8c9d0", "api-eu", "api-eu.example.com:443", "UNHEALTHY"),
    ]:
        if db.scalar(select(HealthCheck).where(HealthCheck.health_check_id == hc_id)) is None:
            db.add(HealthCheck(health_check_id=hc_id, name=name, target=target, status=status))
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
        routing_policy="failover", set_identifier="primary", failover="PRIMARY", health_check_id="hc-0a1b2c3d4e5f6a7b8",
    )  # fmt: skip
    _add(db, zone, "failover", "A", ["203.0.113.99"], routing_policy="failover", set_identifier="secondary", failover="SECONDARY")
    # geolocation
    _add(db, zone, "geo", "A", ["203.0.113.50"], routing_policy="geolocation", set_identifier="default", geo_country="*")
    _add(db, zone, "geo", "A", ["203.0.113.51"], routing_policy="geolocation", set_identifier="europe", geo_continent="EU")
    _add(db, zone, "geo", "A", ["203.0.113.52"], routing_policy="geolocation", set_identifier="us-ca", geo_country="US", geo_subdivision="CA")
    # multivalue
    for i, ip in enumerate(["203.0.113.61", "203.0.113.62", "203.0.113.63"], start=1):
        _add(db, zone, "pool", "A", [ip], ttl=60, routing_policy="multivalue", set_identifier=f"node-{i}")
    _add(db, zone, "api-eu", "A", ["203.0.113.70"], routing_policy="multivalue", set_identifier="api-eu-1", health_check_id="hc-2c3d4e5f6a7b8c9d0")
    for sub in ("api", "auth", "blog", "docs", "status", "grafana", "git", "ci"):
        _add(db, zone, sub, "CNAME", [f"{sub}-lb.example.net"])


def _seed_simple(db: Session, zone: HostedZone, host_ip: str) -> None:
    _add(db, zone, "@", "A", [host_ip])
    _add(db, zone, "www", "CNAME", [zone.name])
    _add(db, zone, "@", "TXT", ['"v=spf1 -all"'])
    _add(db, zone, "@", "MX", ["10 mx1." + zone.name])


def seed_all(db: Session) -> None:
    ensure_user(db)
    if db.scalar(select(HostedZone.id).limit(1)) is not None:
        return
    seed_health_checks(db)
    for name, kind, comment, zone_id in DEMO_ZONES:
        vpc = VpcIn(vpc_id="vpc-0a1b2c3d4e5f60789", region="us-east-1") if kind == "private" else None
        zone = zone_service.create_zone(db, HostedZoneCreate(name=name, type=kind, comment=comment, vpc=vpc), created_by="demo-user", zone_id=zone_id)
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
            created_by="demo-user",
        )
        _seed_simple(db, zone, f"203.0.113.{index + 100}")
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
