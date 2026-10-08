from sqlalchemy import String, case, cast, or_, select
from sqlalchemy.orm import Session

from app.models import DnsRecord, HostedZone
from app.repositories.pagination import paginate

SORT_COLUMNS = {
    "type": DnsRecord.type,
    "ttl": DnsRecord.ttl,
    "routing_policy": DnsRecord.routing_policy,
    "created_at": DnsRecord.created_at,
}


def get(db: Session, record_id: int) -> DnsRecord | None:
    return db.get(DnsRecord, record_id)


def siblings(db: Session, zone_pk: int, name: str, exclude_id: int | None = None) -> list[DnsRecord]:
    query = select(DnsRecord).where(DnsRecord.hosted_zone_id == zone_pk, DnsRecord.name == name)
    if exclude_id is not None:
        query = query.where(DnsRecord.id != exclude_id)
    return list(db.scalars(query).unique().all())


def search(
    db: Session,
    zone: HostedZone,
    *,
    q: str | None,
    rtype: str | None,
    routing_policy: str | None,
    alias: bool | None,
    sort: str,
    order: str,
    page: int,
    page_size: int,
) -> tuple[list[DnsRecord], int]:
    query = select(DnsRecord).where(DnsRecord.hosted_zone_id == zone.id)
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.where(
            or_(
                DnsRecord.name.ilike(like),
                DnsRecord.type.ilike(like),
                DnsRecord.set_identifier.ilike(like),
                DnsRecord.alias_target.ilike(like),
                cast(DnsRecord.values, String).ilike(like),
            )
        )
    if rtype:
        query = query.where(DnsRecord.type == rtype.upper())
    if routing_policy:
        query = query.where(DnsRecord.routing_policy == routing_policy.lower())
    if alias is not None:
        query = query.where(DnsRecord.alias_target.is_not(None) if alias else DnsRecord.alias_target.is_(None))

    descending = order == "desc"
    if sort in SORT_COLUMNS:
        column = SORT_COLUMNS[sort]
        primary = column.desc() if descending else column.asc()
        query = query.order_by(primary, DnsRecord.name, DnsRecord.type, DnsRecord.id)
    else:
        # Default "name" order keeps the zone apex first, like the Route 53 console.
        apex_first = case((DnsRecord.name == f"{zone.name}.", 0), else_=1)
        name_order = DnsRecord.name.desc() if descending else DnsRecord.name.asc()
        query = query.order_by(apex_first, name_order, DnsRecord.type, DnsRecord.set_identifier)
    return paginate(db, query, page, page_size)
