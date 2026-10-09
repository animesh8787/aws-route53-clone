"""Generic CRUD for ``Resource`` rows, driven by a ``ResourceKind`` definition."""
from typing import Any

from pydantic import ValidationError
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, ValidationFailure, field_error
from app.core.ids import new_id
from app.models import Resource
from app.repositories.pagination import paginate
from app.services import activity_service
from app.services.resources.base import ResourceKind
from app.services.resources.registry import get_kind

BASE_SORTS = {"name": Resource.name, "status": Resource.status, "created_at": Resource.created_at}


def to_out(resource: Resource, db: Session | None = None) -> dict[str, Any]:
    """Flat representation: bookkeeping fields plus the kind's own fields."""
    out = _flat(resource)
    kind = get_kind(resource.kind)
    if kind.present is not None and db is not None:
        out.update(kind.present(db, resource, out))
    return out


def _flat(resource: Resource) -> dict[str, Any]:
    return {
        "id": resource.public_id,
        "kind": resource.kind,
        "name": resource.name,
        "status": resource.status,
        "created_at": resource.created_at,
        "updated_at": resource.updated_at,
        **{k: v for k, v in (resource.data or {}).items() if k != "name"},
    }


def _parse(kind: ResourceKind, raw: dict) -> dict:
    """Validate the payload with the kind's Pydantic model, mapping errors to field errors."""
    try:
        return kind.payload.model_validate(raw).model_dump()
    except ValidationError as exc:
        errors = []
        for err in exc.errors():
            field = ".".join(str(p) for p in err["loc"]) or "request"
            message = err["msg"].removeprefix("Value error, ")
            errors.append(field_error(field, message))
        first = errors[0]
        raise ValidationFailure(f"{first['field']}: {first['message']}", errors) from exc


def get_owned(db: Session, owner_id: int, kind: ResourceKind, public_id: str) -> Resource:
    resource = db.scalar(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == kind.kind, Resource.public_id == public_id))
    if resource is None:
        raise NotFoundError(f"{kind.label} not found.")
    return resource


def list_all(db: Session, owner_id: int, kind: ResourceKind) -> list[Resource]:
    return list(db.scalars(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == kind.kind).order_by(Resource.name)))


def search(
    db: Session, owner_id: int, kind: ResourceKind, *, q: str | None, status: str | None, filters: dict[str, str],
    sort: str, order: str, page: int, page_size: int,
) -> tuple[list[Resource], int]:  # fmt: skip
    query = select(Resource).where(Resource.owner_id == owner_id, Resource.kind == kind.kind)
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.where(or_(Resource.name.ilike(like), Resource.public_id.ilike(like), cast(Resource.data, String).ilike(like)))
    if status:
        query = query.where(Resource.status == status)
    for key, value in filters.items():
        if key in kind.filters and value:
            query = query.where(Resource.data[key].as_string() == value)
    if sort in BASE_SORTS:
        column = BASE_SORTS[sort]
    elif sort in kind.sort_keys:
        column = func.lower(Resource.data[sort].as_string())
    else:
        column = Resource.name
    return paginate(db, query.order_by(column.desc() if order == "desc" else column.asc(), Resource.id), page, page_size)


def _unique_name(db: Session, owner_id: int, kind: ResourceKind, name: str, exclude: int | None) -> None:
    query = select(Resource.id).where(Resource.owner_id == owner_id, Resource.kind == kind.kind, func.lower(Resource.name) == name.lower())
    if exclude is not None:
        query = query.where(Resource.id != exclude)
    if db.scalar(query) is not None:
        raise ConflictError(f"A {kind.label.lower()} named '{name}' already exists.")


def _prepare(db: Session, owner_id: int, kind: ResourceKind, raw: dict, existing: Resource | None) -> dict:
    data = _parse(kind, raw)
    data["name"] = data["name"].strip()
    if kind.validate is not None:
        data = kind.validate(db, owner_id, data, existing)
    _unique_name(db, owner_id, kind, data["name"], existing.id if existing else None)
    return data


def create(db: Session, owner_id: int, kind: ResourceKind, raw: dict, *, public_id: str | None = None, status: str | None = None) -> Resource:
    data = _prepare(db, owner_id, kind, raw, None)
    resource = Resource(
        owner_id=owner_id, kind=kind.kind, public_id=public_id or new_id(kind.id_prefix), name=data["name"],
        status=status or kind.default_status, data=data,
    )  # fmt: skip
    db.add(resource)
    db.flush()
    try:
        if kind.after_create:
            kind.after_create(db, owner_id, resource)
    except Exception:
        db.rollback()
        raise
    activity_service.record(db, owner_id, "created", kind.label, resource.name, href=f"{kind.href}/{resource.public_id}")
    db.commit()
    db.refresh(resource)
    return resource


def update(db: Session, owner_id: int, kind: ResourceKind, resource: Resource, raw: dict) -> Resource:
    data = _prepare(db, owner_id, kind, raw, resource)
    resource.name = data["name"]
    resource.data = data
    db.flush()
    try:
        if kind.after_update:
            kind.after_update(db, owner_id, resource)
    except Exception:
        db.rollback()
        raise
    activity_service.record(db, owner_id, "updated", kind.label, resource.name, href=f"{kind.href}/{resource.public_id}")
    db.commit()
    db.refresh(resource)
    return resource


def delete(db: Session, owner_id: int, kind: ResourceKind, resource: Resource) -> None:
    if kind.guard_delete:
        kind.guard_delete(db, owner_id, resource)
    if kind.after_delete:
        kind.after_delete(db, owner_id, resource)
    activity_service.record(db, owner_id, "deleted", kind.label, resource.name)
    db.delete(resource)
    db.commit()
