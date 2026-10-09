"""Read-only tools the assistant can call. Every tool is scoped to the signed-in owner and never changes data.

Outputs are compact JSON strings, trimmed so a conversation stays inside the free-tier token budget.
"""
import json
from collections.abc import Callable
from typing import Any

from sqlalchemy import String, cast, or_, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import ActivityEvent, DnsRecord, HealthCheck, HostedZone, Resource
from app.services import billing_service, resolver_service
from app.services.resources import service as resource_service
from app.services.resources.registry import all_kinds, get_kind

MAX_CHARS = 6000
RESOURCE_KINDS = (
    "profile", "cidr_collection", "traffic_policy", "policy_record", "domain", "domain_request", "resolver_inbound", "resolver_outbound",
    "resolver_rule", "query_logging", "fw_domain_list", "fw_rule_group", "global_resolver", "shared_dns_view", "resolver_outpost",
)  # fmt: skip

TOOL_LABELS = {
    "get_account_overview": "Reviewing your Route 53 resources",
    "list_hosted_zones": "Looking up your hosted zones",
    "get_hosted_zone": "Reading the hosted zone's records",
    "search_records": "Searching your DNS records",
    "list_health_checks": "Checking your health checks",
    "resolve_dns": "Running a DNS query in the simulator",
    "list_console_resources": "Listing console resources",
    "get_billing_estimate": "Calculating the cost estimate",
    "recent_activity": "Reading recent activity",
}

TOOL_SPECS: list[dict[str, Any]] = [
    {"type": "function", "function": {"name": "get_account_overview", "description": "Counts of every Route 53 resource in the user's account (zones, records, health checks and console resources).", "parameters": {"type": "object", "properties": {}}}},
    {
        "type": "function",
        "function": {
            "name": "list_hosted_zones",
            "description": "List the user's hosted zones (name, ID, public/private, record count, description). Optional text filter.",
            "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "Filter by part of the name, ID or description"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_hosted_zone",
            "description": "One hosted zone with its records (name, type, TTL, values or alias, routing policy, health check). Accepts a zone name or ID.",
            "parameters": {
                "type": "object",
                "properties": {"zone": {"type": "string", "description": "Zone name (example.com) or hosted zone ID"}, "record_type": {"type": "string", "description": "Only this record type, e.g. MX"}},
                "required": ["zone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_records",
            "description": "Search records across all of the user's hosted zones by name or value, optionally by type or routing policy, or only records without a health check.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "record_type": {"type": "string"},
                    "routing_policy": {"type": "string", "enum": ["simple", "weighted", "latency", "failover", "geolocation", "multivalue", "ipbased"]},
                    "without_health_check": {"type": "boolean", "description": "Only records that use a non-simple routing policy but have no health check"},
                },
            },
        },
    },
    {"type": "function", "function": {"name": "list_health_checks", "description": "The user's health checks with status, endpoint and how many records use each.", "parameters": {"type": "object", "properties": {}}}},
    {
        "type": "function",
        "function": {
            "name": "resolve_dns",
            "description": "Ask the console's DNS simulator how a query would be answered from the user's records (applies routing policies, health, firewall and resolver rules). Returns rcode, answers and a trace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "type": {"type": "string", "description": "Record type, default A"},
                    "client_region": {"type": "string", "description": "AWS Region of the client, for latency routing"},
                    "client_country": {"type": "string", "description": "Two-letter country code, for geolocation routing"},
                    "client_ip": {"type": "string", "description": "Client IP address, for IP-based routing"},
                    "source_vpc": {"type": "string", "description": "VPC ID the query comes from (private zones, DNS Firewall, resolver rules)"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_console_resources",
            "description": "List console resources of one kind (profiles, CIDR collections, traffic policies, policy records, domains, domain requests, resolver endpoints, rules, query logging, DNS Firewall lists and rule groups, global resolvers, shared DNS views, Outpost resolvers).",
            "parameters": {"type": "object", "properties": {"kind": {"type": "string", "enum": list(RESOURCE_KINDS)}, "query": {"type": "string"}}, "required": ["kind"]},
        },
    },
    {"type": "function", "function": {"name": "get_billing_estimate", "description": "The account's estimated monthly Route 53 cost, by line item (simulated prices).", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "recent_activity", "description": "The latest changes made in the account (created, updated, deleted resources).", "parameters": {"type": "object", "properties": {"limit": {"type": "integer"}}}}},
]


def _dump(value: Any) -> str:
    text = json.dumps(value, default=str, separators=(",", ":"))
    return text if len(text) <= MAX_CHARS else text[: MAX_CHARS - 60] + '..."(truncated: ask for a narrower query)"'


def _zone_brief(z: HostedZone) -> dict:
    return {"name": z.name, "id": z.zone_id, "type": "private" if z.is_private else "public", "records": z.record_count, "description": z.comment or None}


def _record_brief(r: DnsRecord, zone_name: str | None = None) -> dict:
    out: dict[str, Any] = {"name": r.name, "type": r.type, "routing": r.routing_policy}
    if zone_name:
        out["zone"] = zone_name
    if r.alias_target:
        out["alias_to"] = r.alias_target
    else:
        out["ttl"] = r.ttl
        out["values"] = r.values[:8]
    for key in ("set_identifier", "weight", "region", "failover", "geo_country", "geo_continent", "cidr_location"):
        value = getattr(r, key, None)
        if value not in (None, ""):
            out[key] = value
    if r.health_check_id:
        out["health_check"] = True
    if r.is_system:
        out["system"] = True
    return out


def _find_zone(db: Session, owner_id: int, ref: str) -> HostedZone | None:
    ref = ref.strip()
    name = ref.lower().rstrip(".") + "."
    query = select(HostedZone).where(HostedZone.owner_id == owner_id, or_(HostedZone.zone_id == ref.removeprefix("/hostedzone/"), HostedZone.name == name, HostedZone.name == name.rstrip(".")))
    return db.scalars(query).first()


def get_account_overview(db: Session, owner_id: int, **_: Any) -> str:
    zones = db.scalars(select(HostedZone).where(HostedZone.owner_id == owner_id)).all()
    checks = db.scalars(select(HealthCheck).where(HealthCheck.owner_id == owner_id)).all()
    kinds: dict[str, int] = {}
    for kind in db.scalars(select(Resource.kind).where(Resource.owner_id == owner_id)):
        kinds[kind] = kinds.get(kind, 0) + 1
    return _dump({
        "hosted_zones": len(zones), "private_zones": sum(1 for z in zones if z.is_private), "records": sum(z.record_count for z in zones),
        "health_checks": len(checks), "unhealthy_health_checks": sum(1 for c in checks if c.status == "UNHEALTHY"), "console_resources": kinds,
    })  # fmt: skip


def list_hosted_zones(db: Session, owner_id: int, query: str = "", **_: Any) -> str:
    stmt = select(HostedZone).where(HostedZone.owner_id == owner_id).order_by(HostedZone.name)
    if query:
        like = f"%{query.strip().lower()}%"
        stmt = stmt.where(or_(HostedZone.name.ilike(like), HostedZone.zone_id.ilike(like), HostedZone.comment.ilike(like)))
    zones = db.scalars(stmt.limit(40)).all()
    return _dump({"count": len(zones), "hosted_zones": [_zone_brief(z) for z in zones]})


def get_hosted_zone(db: Session, owner_id: int, zone: str = "", record_type: str = "", **_: Any) -> str:
    found = _find_zone(db, owner_id, zone)
    if found is None:
        return _dump({"error": f"No hosted zone named or with ID '{zone}' in this account."})
    records = [r for r in sorted(found.records, key=lambda r: (r.name, r.type)) if not record_type or r.type == record_type.upper()]
    return _dump({"zone": _zone_brief(found), "name_servers_note": "NS and SOA are system records", "records": [_record_brief(r) for r in records[:60]], "total_records": len(records)})


def search_records(db: Session, owner_id: int, query: str = "", record_type: str = "", routing_policy: str = "", without_health_check: bool = False, **_: Any) -> str:
    stmt = select(DnsRecord, HostedZone.name).join(HostedZone, HostedZone.id == DnsRecord.hosted_zone_id).where(HostedZone.owner_id == owner_id)
    if query:
        like = f"%{query.strip().lower()}%"
        stmt = stmt.where(or_(DnsRecord.name.ilike(like), cast(DnsRecord.values, String).ilike(like)))
    if record_type:
        stmt = stmt.where(DnsRecord.type == record_type.upper())
    if routing_policy:
        stmt = stmt.where(DnsRecord.routing_policy == routing_policy)
    if without_health_check:
        stmt = stmt.where(DnsRecord.health_check_id.is_(None), DnsRecord.routing_policy != "simple", DnsRecord.alias_target.is_(None))
    rows = db.execute(stmt.order_by(HostedZone.name, DnsRecord.name).limit(60)).all()
    return _dump({"count": len(rows), "records": [_record_brief(r, zone_name) for r, zone_name in rows]})


def list_health_checks(db: Session, owner_id: int, **_: Any) -> str:
    checks = db.scalars(select(HealthCheck).where(HealthCheck.owner_id == owner_id).order_by(HealthCheck.name)).all()
    used: dict[int, int] = {}
    for hc_id in db.scalars(select(DnsRecord.health_check_id).join(HostedZone, HostedZone.id == DnsRecord.hosted_zone_id).where(HostedZone.owner_id == owner_id, DnsRecord.health_check_id.is_not(None))):
        used[hc_id] = used.get(hc_id, 0) + 1
    return _dump({
        "health_checks": [
            {"name": c.name, "id": c.health_check_id, "type": c.type, "endpoint": f"{c.endpoint}:{c.port}{c.path or ''}", "status": c.status, "used_by_records": used.get(c.id, 0)}
            for c in checks
        ]
    })  # fmt: skip


def resolve_dns(db: Session, owner_id: int, name: str = "", type: str = "A", client_region: str = "", client_country: str = "", client_ip: str = "", source_vpc: str = "", **_: Any) -> str:  # noqa: A002
    result = resolver_service.resolve(
        db, name, type or "A", client_region=client_region or None, client_country=client_country or None, client_ip=client_ip or None,
        source_vpc=source_vpc or None, seed=7, owner_id=owner_id,
    )  # fmt: skip
    data = result.model_dump()
    data["trace"] = data["trace"][:12]
    return _dump(data)


def list_console_resources(db: Session, owner_id: int, kind: str = "", query: str = "", **_: Any) -> str:
    if kind not in RESOURCE_KINDS:
        return _dump({"error": f"Unknown kind '{kind}'.", "kinds": list(RESOURCE_KINDS)})
    spec = get_kind(kind)
    rows, total = resource_service.search(db, owner_id, spec, q=query or None, status=None, filters={}, sort="name", order="asc", page=1, page_size=25)
    items = []
    for r in rows:
        out = resource_service.to_out(r, db)
        items.append({k: v for k, v in out.items() if k not in ("kind", "created_at", "updated_at", "versions", "document", "contact", "auth_code") and v not in (None, "", [], {})})
    return _dump({"kind": kind, "total": total, "items": items})


def get_billing_estimate(db: Session, owner_id: int, **_: Any) -> str:
    estimate = billing_service.estimate(db, owner_id)
    return _dump({"total_usd": estimate["total"], "lines": estimate["lines"], "note": estimate["disclaimer"]})


def recent_activity(db: Session, owner_id: int, limit: int = 10, **_: Any) -> str:
    rows = db.scalars(select(ActivityEvent).where(ActivityEvent.owner_id == owner_id).order_by(ActivityEvent.created_at.desc(), ActivityEvent.id.desc()).limit(max(1, min(int(limit or 10), 25)))).all()
    return _dump([{"when": e.created_at, "action": e.action, "type": e.resource_type, "name": e.resource_name, "detail": e.detail or None} for e in rows])


TOOLS: dict[str, Callable[..., str]] = {
    "get_account_overview": get_account_overview,
    "list_hosted_zones": list_hosted_zones,
    "get_hosted_zone": get_hosted_zone,
    "search_records": search_records,
    "list_health_checks": list_health_checks,
    "resolve_dns": resolve_dns,
    "list_console_resources": list_console_resources,
    "get_billing_estimate": get_billing_estimate,
    "recent_activity": recent_activity,
}


def run_tool(db: Session, owner_id: int, name: str, arguments: str | dict | None) -> str:
    """Execute a tool by name with JSON arguments; errors come back as data for the model, never as exceptions."""
    func = TOOLS.get(name)
    if func is None:
        return _dump({"error": f"Unknown tool '{name}'."})
    try:
        args = arguments if isinstance(arguments, dict) else json.loads(arguments or "{}")
        if not isinstance(args, dict):
            args = {}
    except json.JSONDecodeError:
        return _dump({"error": "Arguments were not valid JSON."})
    try:
        return func(db, owner_id, **{k: v for k, v in args.items() if isinstance(k, str)})
    except AppError as exc:
        return _dump({"error": exc.detail})
    except (TypeError, ValueError) as exc:
        return _dump({"error": f"Invalid arguments: {exc}"})


def kinds_available() -> list[str]:
    return [k.kind for k in all_kinds()]
