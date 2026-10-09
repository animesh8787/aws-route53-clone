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
from app.services import activity_service, zone_extras, zone_service

router = APIRouter(prefix="/hosted-zones", tags=["hosted zones"])


@router.get("", response_model=Page[HostedZoneOut])
def list_zones(
    q: str | None = None,
    type: Literal["public", "private"] | None = None,
    sort: Literal["name", "type", "record_count", "created_at", "comment"] = "name",
    order: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows, total = zone_repo.search(db, owner_id=user.id, q=q, zone_type=type, sort=sort, order=order, page=page, page_size=page_size)
    return Page(items=[zone_service.to_out(z) for z in rows], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))


@router.post("", response_model=HostedZoneOut, status_code=201)
def create_zone(body: HostedZoneCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    zone = zone_service.create_zone(db, body, owner_id=user.id, created_by=user.display_name)
    activity_service.log(db, user.id, "created", "Hosted zone", zone.name, href=f"/hosted-zones/{zone.zone_id}")
    return zone_service.to_out(zone)


@router.get("/{zone_ref}", response_model=HostedZoneOut)
def get_zone(zone_ref: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return zone_service.to_out(zone_service.get_or_404(db, zone_ref, user.id))


@router.put("/{zone_ref}", response_model=HostedZoneOut)
def update_zone(zone_ref: str, body: HostedZoneUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    zone = zone_service.get_or_404(db, zone_ref, user.id)
    updated = zone_service.update_comment(db, zone, body.comment)
    activity_service.log(db, user.id, "updated", "Hosted zone", updated.name, href=f"/hosted-zones/{updated.zone_id}")
    return zone_service.to_out(updated)


@router.delete("/{zone_ref}", response_model=Message)
def delete_zone(zone_ref: str, force: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    zone = zone_service.get_or_404(db, zone_ref, user.id)
    name = zone.name
    zone_service.delete_zone(db, zone, force=force)
    activity_service.log(db, user.id, "deleted", "Hosted zone", name)
    return Message(detail="Hosted zone deleted.")


@router.get("/{zone_ref}/tags")
def get_tags(zone_ref: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"tags": list(zone_service.get_or_404(db, zone_ref, user.id).tags or [])}


@router.put("/{zone_ref}/tags")
def put_tags(zone_ref: str, body: zone_extras.TagsIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    zone = zone_service.get_or_404(db, zone_ref, user.id)
    tags = zone_extras.set_tags(db, zone, body.tags)
    activity_service.log(db, user.id, "updated", "Hosted zone tags", zone.name, href=f"/hosted-zones/{zone.zone_id}?tab=tags", detail=f"{len(tags)} tag(s)")
    return {"tags": tags}


@router.get("/{zone_ref}/dnssec")
def get_dnssec(zone_ref: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return zone_extras.dnssec_status(zone_service.get_or_404(db, zone_ref, user.id))


@router.post("/{zone_ref}/dnssec/enable")
def enable_dnssec(zone_ref: str, body: zone_extras.DnssecEnable, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    zone = zone_service.get_or_404(db, zone_ref, user.id)
    result = zone_extras.enable_dnssec(db, zone, body)
    activity_service.log(db, user.id, "updated", "DNSSEC", zone.name, href=f"/hosted-zones/{zone.zone_id}?tab=dnssec", detail="Signing enabled")
    return result


@router.post("/{zone_ref}/dnssec/disable")
def disable_dnssec(zone_ref: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    zone = zone_service.get_or_404(db, zone_ref, user.id)
    result = zone_extras.disable_dnssec(db, zone)
    activity_service.log(db, user.id, "updated", "DNSSEC", zone.name, href=f"/hosted-zones/{zone.zone_id}?tab=dnssec", detail="Signing disabled")
    return result
