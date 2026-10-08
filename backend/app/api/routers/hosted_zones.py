from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.repositories import zone_repo
from app.repositories.pagination import page_count
from app.schemas.common import Message, Page
from app.schemas.hosted_zone import HostedZoneCreate, HostedZoneOut, HostedZoneUpdate
from app.services import zone_service

router = APIRouter(prefix="/hosted-zones", tags=["hosted zones"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=Page[HostedZoneOut])
def list_zones(
    q: str | None = None,
    type: Literal["public", "private"] | None = None,
    sort: Literal["name", "type", "record_count", "created_at", "comment"] = "name",
    order: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    rows, total = zone_repo.search(db, q=q, zone_type=type, sort=sort, order=order, page=page, page_size=page_size)
    return Page(items=[zone_service.to_out(z) for z in rows], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))


@router.post("", response_model=HostedZoneOut, status_code=201)
def create_zone(body: HostedZoneCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return zone_service.to_out(zone_service.create_zone(db, body, created_by=user.display_name))


@router.get("/{zone_ref}", response_model=HostedZoneOut)
def get_zone(zone_ref: str, db: Session = Depends(get_db)):
    return zone_service.to_out(zone_service.get_or_404(db, zone_ref))


@router.put("/{zone_ref}", response_model=HostedZoneOut)
def update_zone(zone_ref: str, body: HostedZoneUpdate, db: Session = Depends(get_db)):
    zone = zone_service.get_or_404(db, zone_ref)
    return zone_service.to_out(zone_service.update_comment(db, zone, body.comment))


@router.delete("/{zone_ref}", response_model=Message)
def delete_zone(zone_ref: str, force: bool = False, db: Session = Depends(get_db)):
    zone = zone_service.get_or_404(db, zone_ref)
    zone_service.delete_zone(db, zone, force=force)
    return Message(detail="Hosted zone deleted.")
