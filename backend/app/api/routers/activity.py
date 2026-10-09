from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import ActivityEvent, User
from app.repositories.pagination import page_count, paginate
from app.schemas.common import Message, Page
from app.services import activity_service

router = APIRouter(prefix="/activity", tags=["activity"])


def _out(e: ActivityEvent) -> dict[str, Any]:
    return {
        "id": str(e.id), "name": e.resource_name, "action": e.action, "resource_type": e.resource_type, "href": e.href,
        "detail": e.detail, "is_read": e.is_read, "created_at": e.created_at, "status": None,
    }  # fmt: skip


@router.get("", response_model=Page[dict[str, Any]])
def list_activity(
    q: str | None = None,
    filter_action: str | None = None,
    filter_resource_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(ActivityEvent).where(ActivityEvent.owner_id == user.id)
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.where(or_(ActivityEvent.resource_name.ilike(like), ActivityEvent.detail.ilike(like), cast(ActivityEvent.resource_type, String).ilike(like)))
    if filter_action:
        query = query.where(ActivityEvent.action == filter_action)
    if filter_resource_type:
        query = query.where(ActivityEvent.resource_type == filter_resource_type)
    rows, total = paginate(db, query.order_by(ActivityEvent.id.desc()), page, page_size)
    return Page(items=[_out(r) for r in rows], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))


@router.get("/summary")
def activity_summary(limit: int = Query(8, ge=1, le=30), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """What the notifications bell shows: unread count plus the latest events."""
    total = db.scalar(select(func.count()).where(ActivityEvent.owner_id == user.id)) or 0
    return {"unread": activity_service.unread_count(db, user.id), "total": total, "items": [_out(e) for e in activity_service.recent(db, user.id, limit)]}


@router.post("/read", response_model=Message)
def mark_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    activity_service.mark_all_read(db, user.id)
    return Message(detail="All notifications marked as read.")
