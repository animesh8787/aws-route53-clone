from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.repositories import record_repo
from app.repositories.pagination import page_count
from app.schemas.common import Message, Page
from app.schemas.record import BulkDeleteRequest, BulkDeleteResult, BulkTtlRequest, BulkTtlResult, RecordIn, RecordOut
from app.services import activity_service, record_service, zone_service

zone_records = APIRouter(prefix="/hosted-zones/{zone_ref}/records", tags=["records"], dependencies=[Depends(get_current_user)])
records = APIRouter(prefix="/records", tags=["records"], dependencies=[Depends(get_current_user)])


@zone_records.get("", response_model=Page[RecordOut])
def list_records(
    zone_ref: str,
    q: str | None = None,
    type: str | None = None,
    routing_policy: str | None = None,
    alias: bool | None = None,
    sort: Literal["name", "type", "ttl", "routing_policy", "created_at"] = "name",
    order: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    zone = zone_service.get_or_404(db, zone_ref)
    rows, total = record_repo.search(
        db, zone, q=q, rtype=type, routing_policy=routing_policy, alias=alias,
        sort=sort, order=order, page=page, page_size=page_size,
    )  # fmt: skip
    return Page(
        items=[record_service.to_out(r, zone.zone_id) for r in rows],
        total=total, page=page, page_size=page_size, pages=page_count(total, page_size),
    )  # fmt: skip


@zone_records.post("", response_model=RecordOut, status_code=201)
def create_record(zone_ref: str, body: RecordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    zone = zone_service.get_or_404(db, zone_ref)
    record = record_service.create_record(db, zone, body)
    activity_service.log(db, user.id, "created", "Record", f"{record.name.rstrip('.')} ({record.type})", href=f"/hosted-zones/{zone.zone_id}")
    return record_service.to_out(record, zone.zone_id)


@zone_records.post("/bulk-delete", response_model=BulkDeleteResult)
def bulk_delete(zone_ref: str, body: BulkDeleteRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    zone = zone_service.get_or_404(db, zone_ref)
    deleted, skipped = record_service.bulk_delete(db, zone, body.ids)
    if deleted:
        activity_service.log(db, user.id, "deleted", "Records", f"{deleted} record(s) in {zone.name}", href=f"/hosted-zones/{zone.zone_id}")
    return BulkDeleteResult(deleted=deleted, skipped=skipped)


@zone_records.post("/bulk-ttl", response_model=BulkTtlResult)
def bulk_ttl(zone_ref: str, body: BulkTtlRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    zone = zone_service.get_or_404(db, zone_ref)
    updated, skipped = record_service.bulk_update_ttl(db, zone, body.ids, body.ttl)
    if updated:
        activity_service.log(db, user.id, "updated", "Records", f"TTL of {updated} record(s) in {zone.name}", href=f"/hosted-zones/{zone.zone_id}")
    return BulkTtlResult(updated=updated, skipped=skipped)


@records.get("/{record_id}", response_model=RecordOut)
def get_record(record_id: int, db: Session = Depends(get_db)):
    record = record_service.get_or_404(db, record_id)
    return record_service.to_out(record, record.zone.zone_id)


@records.put("/{record_id}", response_model=RecordOut)
def update_record(record_id: int, body: RecordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = record_service.get_or_404(db, record_id)
    updated = record_service.update_record(db, record, body)
    activity_service.log(db, user.id, "updated", "Record", f"{updated.name.rstrip('.')} ({updated.type})", href=f"/hosted-zones/{updated.zone.zone_id}")
    return record_service.to_out(updated, updated.zone.zone_id)


@records.delete("/{record_id}", response_model=Message)
def delete_record(record_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = record_service.get_or_404(db, record_id)
    label, zone_id = f"{record.name.rstrip('.')} ({record.type})", record.zone.zone_id
    record_service.delete_record(db, record)
    activity_service.log(db, user.id, "deleted", "Record", label, href=f"/hosted-zones/{zone_id}")
    return Message(detail="Record deleted.")
