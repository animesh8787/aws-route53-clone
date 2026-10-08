import json
from typing import Literal

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.schemas.importexport import ImportRequest, ImportResult
from app.services import bind_service, record_service, zone_service

router = APIRouter(prefix="/hosted-zones/{zone_ref}", tags=["import/export"], dependencies=[Depends(get_current_user)])


@router.post("/import", response_model=ImportResult)
def import_zone_file(zone_ref: str, body: ImportRequest, db: Session = Depends(get_db)):
    """Parse a BIND zone file. With ``dry_run`` nothing is saved and the result is a preview."""
    zone = zone_service.get_or_404(db, zone_ref)
    return bind_service.import_zone_file(db, zone, body.content, dry_run=body.dry_run, skip_invalid=body.skip_invalid)


@router.get("/export")
def export_zone(zone_ref: str, format: Literal["json", "bind"] = "json", db: Session = Depends(get_db)):
    zone = zone_service.get_or_404(db, zone_ref)
    records = bind_service.all_records(db, zone)
    if format == "bind":
        body = bind_service.export_bind(zone, records)
        media, filename = "text/plain; charset=utf-8", f"{zone.name}.zone"
    else:
        payload = {
            "hosted_zone": zone_service.to_out(zone).model_dump(mode="json"),
            "records": [record_service.to_out(r, zone.zone_id).model_dump(mode="json") for r in records],
        }
        body = json.dumps(payload, indent=2)
        media, filename = "application/json", f"{zone.name}.json"
    return Response(body, media_type=media, headers={"Content-Disposition": f'attachment; filename="{filename}"'})
