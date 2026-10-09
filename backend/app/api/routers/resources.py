from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.repositories.pagination import page_count
from app.schemas.common import Message, Page
from app.services.resources import service
from app.services.resources.arns import account_fields
from app.services.resources.registry import get_kind

router = APIRouter(prefix="/resources", tags=["console resources"])


@router.get("/{kind}", response_model=Page[dict[str, Any]])
def list_resources(
    kind: str,
    request: Request,
    q: str | None = None,
    status: str | None = None,
    sort: str = "name",
    order: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    spec = get_kind(kind)
    filters = {k.removeprefix("filter_"): v for k, v in request.query_params.items() if k.startswith("filter_")}
    rows, total = service.search(db, user.id, spec, q=q, status=status, filters=filters, sort=sort, order=order, page=page, page_size=page_size)
    return Page(items=[account_fields(service.to_out(r, db), kind, user.account_id) for r in rows], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))


@router.post("/{kind}", response_model=dict[str, Any], status_code=201)
def create_resource(kind: str, body: dict[str, Any] = Body(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    spec = get_kind(kind)
    return account_fields(service.to_out(service.create(db, user.id, spec, body), db), kind, user.account_id)


@router.get("/{kind}/{public_id}", response_model=dict[str, Any])
def get_resource(kind: str, public_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    spec = get_kind(kind)
    return account_fields(service.to_out(service.get_owned(db, user.id, spec, public_id), db), kind, user.account_id)


@router.put("/{kind}/{public_id}", response_model=dict[str, Any])
def update_resource(kind: str, public_id: str, body: dict[str, Any] = Body(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    spec = get_kind(kind)
    resource = service.get_owned(db, user.id, spec, public_id)
    return account_fields(service.to_out(service.update(db, user.id, spec, resource, body), db), kind, user.account_id)


@router.delete("/{kind}/{public_id}", response_model=Message)
def delete_resource(kind: str, public_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    spec = get_kind(kind)
    service.delete(db, user.id, spec, service.get_owned(db, user.id, spec, public_id))
    return Message(detail=f"{spec.label} deleted.")
