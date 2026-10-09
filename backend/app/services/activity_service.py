"""Records user-visible activity (shown in the notifications bell)."""
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import ActivityEvent

KEEP_LATEST = 200


def record(db: Session, owner_id: int, action: str, resource_type: str, resource_name: str, *, href: str | None = None, detail: str = "") -> None:
    """Stage an event on the caller's transaction (committed together with the change itself)."""
    db.add(ActivityEvent(owner_id=owner_id, action=action, resource_type=resource_type, resource_name=resource_name[:255], href=href, detail=detail[:255]))


def recent(db: Session, owner_id: int, limit: int = 20) -> list[ActivityEvent]:
    query = select(ActivityEvent).where(ActivityEvent.owner_id == owner_id).order_by(ActivityEvent.id.desc()).limit(limit)
    return list(db.scalars(query))


def unread_count(db: Session, owner_id: int) -> int:
    return db.scalar(select(func.count()).where(ActivityEvent.owner_id == owner_id, ActivityEvent.is_read.is_(False))) or 0


def mark_all_read(db: Session, owner_id: int) -> None:
    db.execute(update(ActivityEvent).where(ActivityEvent.owner_id == owner_id, ActivityEvent.is_read.is_(False)).values(is_read=True))
    db.commit()
