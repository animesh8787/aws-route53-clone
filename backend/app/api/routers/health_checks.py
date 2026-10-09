from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.repositories.pagination import page_count
from app.schemas.common import Page
from app.schemas.health_check import HealthCheckIn, HealthCheckOut, HealthCheckStatusUpdate
from app.services import health_check_service as svc

router = APIRouter(prefix="/health-checks", tags=["health checks"])


@router.get("", response_model=Page[HealthCheckOut])
def list_health_checks(
    q: str | None = None,
    type: str | None = None,
    status: Literal["healthy", "unhealthy"] | None = None,
    sort: Literal["name", "type", "status", "created_at"] = "name",
    order: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows, total = svc.search(db, user.id, q=q, hc_type=type, status=status, sort=sort, order=order, page=page, page_size=page_size)
    return Page(items=[svc.to_out(db, r) for r in rows], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))


@router.post("", response_model=HealthCheckOut, status_code=201)
def create_health_check(body: HealthCheckIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return svc.to_out(db, svc.create(db, user.id, body))


@router.get("/{health_check_id}", response_model=HealthCheckOut)
def get_health_check(health_check_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return svc.to_out(db, svc.get_owned(db, user.id, health_check_id))


@router.put("/{health_check_id}", response_model=HealthCheckOut)
def update_health_check(health_check_id: str, body: HealthCheckIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hc = svc.get_owned(db, user.id, health_check_id)
    return svc.to_out(db, svc.update(db, user.id, hc, body))


@router.patch("/{health_check_id}/status", response_model=HealthCheckOut)
def set_health_status(health_check_id: str, body: HealthCheckStatusUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hc = svc.get_owned(db, user.id, health_check_id)
    return svc.to_out(db, svc.set_status(db, user.id, hc, body.status, body.note))


@router.get("/{health_check_id}/records")
def health_check_records(health_check_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hc = svc.get_owned(db, user.id, health_check_id)
    return [
        {
            "id": r.id, "name": r.name, "type": r.type, "routing_policy": r.routing_policy,
            "set_identifier": r.set_identifier, "zone_id": r.zone.zone_id, "zone_name": r.zone.name,
        }
        for r in svc.records_using(db, hc)
    ]  # fmt: skip


@router.delete("/{health_check_id}")
def delete_health_check(health_check_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hc = svc.get_owned(db, user.id, health_check_id)
    return {"detail": "Health check deleted.", "detached_records": svc.delete(db, user.id, hc)}
