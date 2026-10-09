"""DNS resolution simulator ("Test record" in the console).

Answers queries from the records stored in the database, applying Route 53 routing
policies. This is a behavioural model, not an authoritative DNS server.
"""
import hashlib
import ipaddress
import random
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dns.constants import AWS_REGIONS, REGION_CONTINENT
from app.dns.mock_data import VPC_BY_ID
from app.dns.validators import DnsValueError, normalize_hostname
from app.models import DnsRecord, HostedZone, Resource
from app.repositories import record_repo
from app.schemas.dns import Answer, ResolveResponse
from app.services import resolver_policy

MAX_CHAIN = 8
MULTIVALUE_LIMIT = 8


@dataclass
class _Ctx:
    db: Session
    rng: random.Random
    client_region: str | None
    client_country: str | None
    client_continent: str | None
    client_ip: str | None = None
    owner_id: int = 0
    trace: list[str] = field(default_factory=list)


def _healthy(record: DnsRecord) -> bool:
    hc = record.health_check
    return hc is None or hc.disabled or hc.status == "HEALTHY"


def _find_zone(db: Session, owner_id: int, fqdn: str, view: str, source_vpc: str | None = None) -> HostedZone | None:
    """Longest-suffix zone. From a VPC only public zones and private zones associated with that VPC are visible."""
    name = fqdn.rstrip(".")
    zones = db.scalars(select(HostedZone).where(HostedZone.owner_id == owner_id)).all()
    if source_vpc:
        zones = [z for z in zones if not z.is_private or any(a.vpc_id == source_vpc for a in z.vpcs)]
    matches = [z for z in zones if name == z.name or name.endswith("." + z.name)]
    if not matches:
        return None
    want_private = view == "private" or bool(source_vpc)
    return max(matches, key=lambda z: (len(z.name), z.is_private == want_private))


def _wildcard_candidates(fqdn: str, zone: HostedZone) -> list[str]:
    labels = fqdn.rstrip(".").split(".")
    zone_labels = len(zone.name.split("."))
    return [".".join(["*", *labels[i:]]) + "." for i in range(1, len(labels) - zone_labels + 1)]


def _region_distance(region: str | None, client: str | None) -> int:
    """Lower is closer: same region 0, same continent 1, otherwise by list order."""
    if not region or not client:
        return 99
    if region == client:
        return 0
    if REGION_CONTINENT.get(region.split("-")[0]) == REGION_CONTINENT.get(client.split("-")[0]):
        return 1 + abs(AWS_REGIONS.index(region) - AWS_REGIONS.index(client)) / 100 if client in AWS_REGIONS else 1
    return 10


def _pick(records: list[DnsRecord], ctx: _Ctx) -> list[DnsRecord]:
    policy = records[0].routing_policy
    healthy = [r for r in records if _healthy(r)]
    if policy == "simple":
        ctx.trace.append("Simple routing: returning the record's values.")
        return records[:1]
    if policy == "weighted":
        pool = healthy or records
        weights = [r.weight or 0 for r in pool]
        if not any(weights):
            weights = [1] * len(pool)
        choice = ctx.rng.choices(pool, weights=weights, k=1)[0]
        ctx.trace.append(f"Weighted routing: chose '{choice.set_identifier}' (weight {choice.weight} of {sum(weights)}).")
        return [choice]
    if policy == "latency":
        pool = healthy or records
        choice = min(pool, key=lambda r: (_region_distance(r.region, ctx.client_region), r.region or ""))
        where = ctx.client_region or "unspecified client region"
        ctx.trace.append(f"Latency routing: closest region to {where} is {choice.region} ('{choice.set_identifier}').")
        return [choice]
    if policy == "failover":
        primary = next((r for r in records if r.failover == "PRIMARY"), None)
        secondary = next((r for r in records if r.failover == "SECONDARY"), None)
        if primary and _healthy(primary):
            ctx.trace.append("Failover routing: primary is healthy; returning PRIMARY.")
            return [primary]
        ctx.trace.append("Failover routing: primary is unhealthy or missing; returning SECONDARY.")
        return [secondary or primary] if (secondary or primary) else []
    if policy == "geolocation":
        for label, test in (
            ("subdivision", lambda r: r.geo_subdivision and r.geo_country == ctx.client_country),
            ("country", lambda r: r.geo_country not in (None, "*") and not r.geo_subdivision and r.geo_country == ctx.client_country),
            ("continent", lambda r: r.geo_continent and r.geo_continent == ctx.client_continent),
            ("default", lambda r: r.geo_country == "*"),
        ):
            match = next((r for r in healthy if test(r)), None)
            if match:
                ctx.trace.append(f"Geolocation routing: matched {label} location '{match.set_identifier}'.")
                return [match]
        ctx.trace.append("Geolocation routing: no location matches the client and there is no default record.")
        return []
    if policy == "ipbased":
        match = _ip_based_match(ctx, healthy)
        if match is not None:
            return [match]
        ctx.trace.append("IP-based routing: the client address matches no CIDR location and there is no default (*) record.")
        return []
    # multivalue
    chosen = healthy[:MULTIVALUE_LIMIT]
    ctx.trace.append(f"Multivalue answer: returning {len(chosen)} healthy record(s) of {len(records)}.")
    return chosen


def _ip_based_match(ctx: _Ctx, records: list[DnsRecord]) -> DnsRecord | None:
    """Pick the record whose CIDR location contains the client IP, falling back to the default (*) location."""
    default = next((r for r in records if r.cidr_location == "*"), None)
    if not ctx.client_ip:
        ctx.trace.append("IP-based routing: no client IP was given, so the default (*) location is used." if default else "IP-based routing: no client IP given.")
        return default
    try:
        address = ipaddress.ip_address(ctx.client_ip)
    except ValueError:
        ctx.trace.append(f"IP-based routing: '{ctx.client_ip}' is not a valid IP address.")
        return default
    for record in records:
        if record.cidr_location == "*":
            continue
        collection = ctx.db.scalar(select(Resource).where(Resource.owner_id == ctx.owner_id, Resource.kind == "cidr_collection", Resource.public_id == record.cidr_collection_id))
        if collection is None:
            continue
        for location in collection.data.get("locations", []):
            if location["name"] != record.cidr_location:
                continue
            for block in location.get("cidr_blocks", []):
                network = ipaddress.ip_network(block, strict=False)
                if network.version == address.version and address in network:
                    ctx.trace.append(f"IP-based routing: {address} is inside {block} (location '{location['name']}').")
                    return record
    ctx.trace.append(f"IP-based routing: {address} is not in any CIDR location" + ("; using the default (*) record." if default else "."))
    return default


def _mock_alias_answers(target: str, rtype: str) -> list[str]:
    digest = hashlib.sha256(target.encode()).digest()
    if rtype == "AAAA":
        return [f"2600:9000:{digest[0]:x}{digest[1]:02x}:{digest[2]:x}{digest[3]:02x}::{digest[4]:x}"]
    return [f"13.{digest[0] % 200 + 20}.{digest[1]}.{digest[2] % 250 + 1}", f"13.{digest[0] % 200 + 20}.{digest[3]}.{digest[4] % 250 + 1}"]


def _resolve(ctx: _Ctx, zone: HostedZone, name: str, rtype: str, depth: int = 0) -> tuple[list[Answer], DnsRecord | None, str]:
    if depth > MAX_CHAIN:
        ctx.trace.append("CNAME/alias chain is too long; giving up.")
        return [], None, "SERVFAIL"
    lookup = [name, *_wildcard_candidates(name, zone)]
    present_any = False
    for candidate in lookup:
        at_name = record_repo.siblings(ctx.db, zone.id, candidate)
        if not at_name:
            continue
        present_any = True
        if candidate != name:
            ctx.trace.append(f"No exact match for {name}; wildcard {candidate} applies.")
        exact = [r for r in at_name if r.type == rtype]
        cname = [r for r in at_name if r.type == "CNAME"]
        if not exact and cname and rtype != "CNAME":
            record = _pick(cname, ctx)[0]
            target = record.values[0] if record.values else None
            ctx.trace.append(f"{name} is a CNAME to {target}.")
            answers = [Answer(name=name, type="CNAME", ttl=record.ttl or 0, value=target or "")]
            if target and (target_zone := _find_zone(ctx.db, ctx.owner_id, target, "public")) is not None:
                tail, _, rcode = _resolve(ctx, target_zone, target, rtype, depth + 1)
                return answers + tail, record, rcode
            ctx.trace.append("CNAME target is outside the hosted zones in this account; stopping.")
            return answers, record, "NOERROR"
        if not exact:
            ctx.trace.append(f"{candidate} exists but has no {rtype} records (NODATA).")
            return [], None, "NOERROR"
        chosen = _pick(exact, ctx)
        if not chosen:
            return [], None, "NOERROR"
        answers: list[Answer] = []
        for record in chosen:
            if record.alias_target:
                answers += _resolve_alias(ctx, zone, name, record, rtype, depth)
            else:
                answers += [Answer(name=name, type=record.type, ttl=record.ttl or 0, value=v) for v in record.values]
        return answers, chosen[0], "NOERROR"
    if not present_any:
        ctx.trace.append(f"{name} does not exist in {zone.name} (NXDOMAIN).")
    return [], None, "NXDOMAIN"


def _resolve_alias(ctx: _Ctx, zone: HostedZone, name: str, record: DnsRecord, rtype: str, depth: int) -> list[Answer]:
    ctx.trace.append(f"Alias to {record.alias_target} ({record.alias_target_type}).")
    if record.alias_target_type == "record":
        answers, _, _ = _resolve(ctx, zone, record.alias_target or "", rtype, depth + 1)
        return [Answer(name=name, type=a.type, ttl=60, value=a.value) for a in answers]
    ctx.trace.append("AWS service targets are simulated with deterministic mock addresses.")
    return [Answer(name=name, type=rtype, ttl=60, value=v) for v in _mock_alias_answers(record.alias_target or "", rtype)]


def resolve(
    db: Session, name: str, rtype: str, *, view: str = "public", client_region: str | None = None,
    client_country: str | None = None, client_continent: str | None = None, client_ip: str | None = None, seed: int | None = None,
    source_vpc: str | None = None, owner_id: int,
) -> ResolveResponse:  # fmt: skip
    rtype = rtype.upper()
    try:
        fqdn = normalize_hostname(name, field="Name")
    except DnsValueError as exc:
        return ResolveResponse(name=name, type=rtype, rcode="FORMERR", answers=[], trace=[str(exc)])
    continent = (client_continent or "").upper() or (REGION_CONTINENT.get((client_region or "").split("-")[0]) if client_region else None)
    country = (client_country or "").upper() or None
    ctx = _Ctx(db, random.Random(seed), client_region, country, continent, (client_ip or "").strip() or None, owner_id)

    vpc = (source_vpc or "").strip() or None
    if vpc and vpc not in VPC_BY_ID:
        return ResolveResponse(name=fqdn, type=rtype, rcode="FORMERR", answers=[], trace=[f"Unknown source VPC '{vpc}'."])
    if vpc:
        ctx.trace.append(f"Query originates in {vpc} ({VPC_BY_ID[vpc]['name']}).")
        for config in resolver_policy.logging_destinations(db, owner_id, vpc):
            ctx.trace.append(f"Query logging: this query is logged to {config.data['destination_arn']} ({config.name}).")
        verdict = resolver_policy.evaluate_firewall(db, owner_id, vpc, fqdn)
        ctx.trace.extend(verdict.trace)
        if verdict.action == "BLOCK":
            return _blocked_response(fqdn, rtype, verdict, ctx.trace)

    zone = _find_zone(db, owner_id, fqdn, view, vpc)
    if zone is None and vpc:
        rule = resolver_policy.matching_rule(db, owner_id, vpc, fqdn)
        if rule is not None and rule.data["rule_type"] == "FORWARD":
            targets = [f"{t['ip']}:{t['port']}" for t in rule.data["target_ips"]]
            ctx.trace.append(f"Resolver rule '{rule.name}' ({rule.data['domain_name']}) matches: forwarded to {', '.join(targets)} through {rule.data['outbound_endpoint_id']}.")
            ctx.trace.append("Forwarded queries are simulated: no answer data is available from the target DNS servers.")
            return ResolveResponse(name=fqdn, type=rtype, rcode="NOERROR", answers=[], routing_policy="forwarded", forwarded_to=targets, trace=ctx.trace)
        if rule is not None:
            ctx.trace.append(f"Resolver rule '{rule.name}' ({rule.data['rule_type']}) matches: the query is resolved by Route 53 or recursively on the internet (simulated).")
    if zone is None:
        ctx.trace.append("No hosted zone in this account is authoritative for that name (REFUSED).")
        return ResolveResponse(name=fqdn, type=rtype, rcode="REFUSED", answers=[], trace=ctx.trace)
    ctx.trace.append(f"Using {'private' if zone.is_private else 'public'} hosted zone {zone.name} ({zone.zone_id}).")
    answers, record, rcode = _resolve(ctx, zone, fqdn, rtype)
    return ResolveResponse(
        name=fqdn, type=rtype, rcode=rcode, answers=answers, hosted_zone_id=zone.zone_id,
        record_id=record.id if record else None, routing_policy=record.routing_policy if record else None, trace=ctx.trace,
    )  # fmt: skip


def _blocked_response(fqdn: str, rtype: str, verdict: resolver_policy.FirewallVerdict, trace: list[str]) -> ResolveResponse:
    if verdict.block_response == "NXDOMAIN":
        return ResolveResponse(name=fqdn, type=rtype, rcode="NXDOMAIN", answers=[], routing_policy="firewall-block", blocked_by=verdict.rule, trace=trace)
    if verdict.block_response == "OVERRIDE":
        answer = Answer(name=fqdn, type="CNAME", ttl=verdict.override_ttl, value=verdict.override_domain)
        return ResolveResponse(name=fqdn, type=rtype, rcode="NOERROR", answers=[answer], routing_policy="firewall-block", blocked_by=verdict.rule, trace=trace)
    return ResolveResponse(name=fqdn, type=rtype, rcode="NOERROR", answers=[], routing_policy="firewall-block", blocked_by=verdict.rule, trace=trace)
