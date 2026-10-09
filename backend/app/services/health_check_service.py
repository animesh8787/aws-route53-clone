"""Health check business rules (simulated: status is set by hand and drives routing answers)."""
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, ValidationFailure, field_error
from app.core.ids import new_id
from app.dns import validators as v
from app.models import DnsRecord, HealthCheck
from app.repositories.pagination import paginate
from app.schemas.health_check import HealthCheckIn, HealthCheckOut
from app.services import activity_service

HEALTH_CHECK_REGIONS = (
    "us-east-1", "us-west-1", "us-west-2", "eu-west-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "sa-east-1",
)  # fmt: skip
STR_MATCH = ("HTTP_STR_MATCH", "HTTPS_STR_MATCH")
HISTORY_LIMIT = 20
SORTS = {"name": HealthCheck.name, "type": HealthCheck.type, "status": HealthCheck.status, "created_at": HealthCheck.created_at}


def _is_endpoint(value: str) -> bool:
    for check in (v.validate_ipv4, v.validate_ipv6):
        try:
            check(value)
            return True
        except v.DnsValueError:
            continue
    try:
        v.normalize_hostname(value, field="Endpoint")
        return True
    except v.DnsValueError:
        return False


def validate_input(payload: HealthCheckIn) -> dict:
    """Return normalised column values or raise ValidationFailure with field errors."""
    errors: list[dict] = []
    data = payload.model_dump()
    data["name"] = payload.name.strip()
    endpoint = payload.endpoint.strip().lower().rstrip(".")
    if not _is_endpoint(endpoint):
        errors.append(field_error("endpoint", "Enter an IPv4 address, an IPv6 address or a domain name."))
    data["endpoint"] = endpoint
    if not 1 <= payload.port <= 65535:
        errors.append(field_error("port", "Port must be between 1 and 65535."))
    if payload.request_interval not in (10, 30):
        errors.append(field_error("request_interval", "Request interval must be 10 or 30 seconds."))
    if not 1 <= payload.failure_threshold <= 10:
        errors.append(field_error("failure_threshold", "Failure threshold must be between 1 and 10."))
    if payload.type == "TCP":
        data["path"], data["search_string"] = "", None
    else:
        if not payload.path.startswith("/"):
            errors.append(field_error("path", "Path must start with /."))
        if payload.type in STR_MATCH:
            if not (payload.search_string or "").strip():
                errors.append(field_error("search_string", "A search string is required for string-matching checks."))
        else:
            data["search_string"] = None
    bad = [r for r in payload.regions if r not in HEALTH_CHECK_REGIONS]
    if bad or (payload.regions and len(payload.regions) < 3):
        errors.append(field_error("regions", "Choose at least three supported regions, or none to use all of them."))
    if errors:
        raise ValidationFailure(errors[0]["message"], errors)
    return data


def _count_records(db: Session, health_pk: int) -> int:
    return db.scalar(select(func.count()).where(DnsRecord.health_check_id == health_pk)) or 0


def to_out(db: Session, hc: HealthCheck) -> HealthCheckOut:
    columns = {c.name: getattr(hc, c.name) for c in hc.__table__.columns}
    return HealthCheckOut.model_validate({**columns, "record_count": _count_records(db, hc.id)})


def get_owned(db: Session, owner_id: int, public_id: str) -> HealthCheck:
    hc = db.scalar(select(HealthCheck).where(HealthCheck.health_check_id == public_id, HealthCheck.owner_id == owner_id))
    if hc is None:
        raise NotFoundError("Health check not found.")
    return hc


def search(db: Session, owner_id: int, *, q: str | None, hc_type: str | None, status: str | None, sort: str, order: str, page: int, page_size: int):
    query = select(HealthCheck).where(HealthCheck.owner_id == owner_id)
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.where(or_(HealthCheck.name.ilike(like), HealthCheck.endpoint.ilike(like), HealthCheck.health_check_id.ilike(like)))
    if hc_type:
        query = query.where(HealthCheck.type == hc_type)
    if status:
        query = query.where(HealthCheck.status == status.upper())
    column = SORTS.get(sort, HealthCheck.name)
    return paginate(db, query.order_by(column.desc() if order == "desc" else column.asc(), HealthCheck.id), page, page_size)


def _ensure_unique_name(db: Session, owner_id: int, name: str, exclude: int | None = None) -> None:
    query = select(HealthCheck.id).where(HealthCheck.owner_id == owner_id, func.lower(HealthCheck.name) == name.lower())
    if exclude is not None:
        query = query.where(HealthCheck.id != exclude)
    if db.scalar(query) is not None:
        raise ConflictError(f"A health check named '{name}' already exists.")


def create(db: Session, owner_id: int, payload: HealthCheckIn, *, public_id: str | None = None) -> HealthCheck:
    data = validate_input(payload)
    _ensure_unique_name(db, owner_id, data["name"])
    hc = HealthCheck(owner_id=owner_id, health_check_id=public_id or new_id("hc"), status="HEALTHY", **data)
    hc.history = [{"status": "HEALTHY", "at": datetime.utcnow().isoformat(timespec="seconds"), "note": "Created"}]
    db.add(hc)
    activity_service.record(db, owner_id, "created", "Health check", hc.name, href=f"/health-checks/{hc.health_check_id}")
    db.commit()
    db.refresh(hc)
    return hc


def update(db: Session, owner_id: int, hc: HealthCheck, payload: HealthCheckIn) -> HealthCheck:
    data = validate_input(payload)
    _ensure_unique_name(db, owner_id, data["name"], exclude=hc.id)
    for key, value in data.items():
        setattr(hc, key, value)
    activity_service.record(db, owner_id, "updated", "Health check", hc.name, href=f"/health-checks/{hc.health_check_id}")
    db.commit()
    db.refresh(hc)
    return hc


def set_status(db: Session, owner_id: int, hc: HealthCheck, status: str, note: str) -> HealthCheck:
    if hc.status != status:
        hc.status = status
        event = {"status": status, "at": datetime.utcnow().isoformat(timespec="seconds"), "note": note or "Status changed manually (simulated)"}
        hc.history = [event, *list(hc.history or [])][:HISTORY_LIMIT]
        activity_service.record(db, owner_id, "updated", "Health check", hc.name, href=f"/health-checks/{hc.health_check_id}", detail=f"Status is now {status.lower()}")
        db.commit()
        db.refresh(hc)
    return hc


def delete(db: Session, owner_id: int, hc: HealthCheck) -> int:
    """Delete the check; records that used it are detached (FK ON DELETE SET NULL). Returns how many were detached."""
    detached = _count_records(db, hc.id)
    activity_service.record(db, owner_id, "deleted", "Health check", hc.name)
    db.delete(hc)
    db.commit()
    return detached


def records_using(db: Session, hc: HealthCheck) -> list[DnsRecord]:
    return list(db.scalars(select(DnsRecord).where(DnsRecord.health_check_id == hc.id).order_by(DnsRecord.name)).unique())
