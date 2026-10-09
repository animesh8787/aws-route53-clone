"""Read-only per-VPC overview: everything attached to a VPC (the "Resolver > VPCs" page)."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.dns.mock_data import MOCK_VPCS, VPC_BY_ID
from app.models import HostedZone, Resource, VpcAssociation

KINDS = ("resolver_inbound", "resolver_outbound", "resolver_rule", "query_logging", "fw_rule_group", "profile")


def _brief(res: Resource) -> dict:
    return {"id": res.public_id, "name": res.name, "status": res.status}


def overview(db: Session, owner_id: int, vpc: dict, by_kind: dict[str, list[Resource]]) -> dict:
    vpc_id = vpc["vpc_id"]
    inbound = [r for r in by_kind["resolver_inbound"] if r.data.get("vpc_id") == vpc_id]
    outbound = [r for r in by_kind["resolver_outbound"] if r.data.get("vpc_id") == vpc_id]
    rules = [r for r in by_kind["resolver_rule"] if vpc_id in r.data.get("vpc_ids", [])]
    logging = [r for r in by_kind["query_logging"] if vpc_id in r.data.get("vpc_ids", [])]
    groups = [r for r in by_kind["fw_rule_group"] if any(a["vpc_id"] == vpc_id for a in r.data.get("associations", []))]
    profile = next((r for r in by_kind["profile"] if vpc_id in r.data.get("vpc_ids", [])), None)
    zones = db.scalars(select(HostedZone).join(VpcAssociation, VpcAssociation.hosted_zone_id == HostedZone.id).where(VpcAssociation.vpc_id == vpc_id)).unique().all()
    return {
        "id": vpc_id, "name": vpc["name"], "region": vpc["region"], "cidr": vpc["cidr"], "status": "ACTIVE",
        "inbound_endpoints": [_brief(r) for r in inbound], "outbound_endpoints": [_brief(r) for r in outbound],
        "rules": [_brief(r) for r in rules], "query_logging": [_brief(r) for r in logging],
        "firewall_groups": [{**_brief(r), "priority": next(a["priority"] for a in r.data["associations"] if a["vpc_id"] == vpc_id)} for r in groups],
        "profile": _brief(profile) if profile else None,
        "private_zones": [{"id": z.zone_id, "name": z.name} for z in zones],
        "endpoint_count": len(inbound) + len(outbound), "rule_count": len(rules), "logging_count": len(logging), "firewall_count": len(groups),
    }  # fmt: skip


def _load(db: Session, owner_id: int) -> dict[str, list[Resource]]:
    rows = db.scalars(select(Resource).where(Resource.owner_id == owner_id, Resource.kind.in_(KINDS))).all()
    return {k: [r for r in rows if r.kind == k] for k in KINDS}


def list_vpcs(db: Session, owner_id: int, *, q: str | None, sort: str, order: str, page: int, page_size: int) -> tuple[list[dict], int]:
    by_kind = _load(db, owner_id)
    items = [overview(db, owner_id, vpc, by_kind) for vpc in MOCK_VPCS]
    if q:
        needle = q.strip().lower()
        items = [i for i in items if needle in i["id"].lower() or needle in i["name"].lower() or needle in i["region"] or needle in i["cidr"]]
    key = sort if sort in ("name", "region", "cidr", "endpoint_count", "rule_count") else "name"
    items.sort(key=lambda i: (i[key] if not isinstance(i[key], str) else i[key].lower(), i["id"]), reverse=order == "desc")
    total = len(items)
    start = (max(page, 1) - 1) * page_size
    return items[start : start + page_size], total


def get_vpc(db: Session, owner_id: int, vpc_id: str) -> dict:
    vpc = VPC_BY_ID.get(vpc_id)
    if vpc is None:
        raise NotFoundError("VPC not found.")
    return overview(db, owner_id, vpc, _load(db, owner_id))
