from fastapi import APIRouter, Depends
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import ConflictError
from app.db.session import get_db
from app.models import ActivityEvent, AssistantConversation, AssistantMessage, HealthCheck, HostedZone, Resource, User
from app.schemas.common import Message
from app.seed import populate
from app.services import activity_service

router = APIRouter(prefix="/account", tags=["account"])


def _is_empty(db: Session, user: User) -> bool:
    return not (
        db.scalar(select(func.count()).where(HostedZone.owner_id == user.id))
        or db.scalar(select(func.count()).where(Resource.owner_id == user.id))
        or db.scalar(select(func.count()).where(HealthCheck.owner_id == user.id))
    )


@router.get("/summary")
def account_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {
        "zones": db.scalar(select(func.count()).where(HostedZone.owner_id == user.id)) or 0,
        "resources": db.scalar(select(func.count()).where(Resource.owner_id == user.id)) or 0,
        "health_checks": db.scalar(select(func.count()).where(HealthCheck.owner_id == user.id)) or 0,
        "empty": _is_empty(db, user),
    }


@router.post("/sample-data", response_model=Message, status_code=201)
def load_sample_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Fill an empty account with a realistic set of zones, records, policies and resolver settings."""
    if not _is_empty(db, user):
        raise ConflictError("Sample data can only be loaded into an empty account. Clear your data first.")
    populate(db, user.id, stable_ids=False)
    return Message(detail="Sample data loaded.")


@router.post("/clear-data", response_model=Message)
def clear_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete every zone, record and console resource in this account (the account itself stays)."""
    for model in (AssistantMessage, AssistantConversation, HostedZone, Resource, HealthCheck, ActivityEvent):
        db.execute(delete(model).where(model.owner_id == user.id))
    db.commit()
    activity_service.log(db, user.id, "deleted", "Account data", "All resources removed")
    return Message(detail="All data was removed from your account.")
