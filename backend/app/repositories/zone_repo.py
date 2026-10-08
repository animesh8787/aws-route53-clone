from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import HostedZone
from app.repositories.pagination import paginate

SORT_COLUMNS = {
    "name": HostedZone.name,
    "type": HostedZone.is_private,
    "record_count": HostedZone.record_count,
    "created_at": HostedZone.created_at,
    "comment": HostedZone.comment,
}


def get_by_ref(db: Session, ref: str) -> HostedZone | None:
    """Look a zone up by public zone id (``Z0123...``) or numeric primary key."""
    if ref.isdigit():
        zone = db.get(HostedZone, int(ref))
        if zone:
            return zone
    return db.scalar(select(HostedZone).where(HostedZone.zone_id == ref))


def find_duplicate(db: Session, name: str, is_private: bool) -> HostedZone | None:
    return db.scalar(select(HostedZone).where(HostedZone.name == name, HostedZone.is_private == is_private))


def search(
    db: Session,
    *,
    q: str | None,
    zone_type: str | None,
    sort: str,
    order: str,
    page: int,
    page_size: int,
) -> tuple[list[HostedZone], int]:
    query = select(HostedZone)
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.where(
            or_(
                HostedZone.name.ilike(like),
                HostedZone.comment.ilike(like),
                HostedZone.zone_id.ilike(like),
            )
        )
    if zone_type in ("public", "private"):
        query = query.where(HostedZone.is_private == (zone_type == "private"))
    column = SORT_COLUMNS.get(sort, HostedZone.name)
    query = query.order_by(column.desc() if order == "desc" else column.asc(), HostedZone.id)
    return paginate(db, query, page, page_size)
