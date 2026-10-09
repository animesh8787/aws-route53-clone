from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.repositories.pagination import page_count
from app.schemas.common import Page
from app.services import resolver_overview

router = APIRouter(prefix="/resolver", tags=["resolver"])


@router.get("/vpcs", response_model=Page[dict[str, Any]])
def list_resolver_vpcs(
    q: str | None = None,
    sort: str = "name",
    order: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items, total = resolver_overview.list_vpcs(db, user.id, q=q, sort=sort, order=order, page=page, page_size=page_size)
    return Page(items=items, total=total, page=page, page_size=page_size, pages=page_count(total, page_size))


@router.get("/vpcs/{vpc_id}", response_model=dict[str, Any])
def get_resolver_vpc(vpc_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return resolver_overview.get_vpc(db, user.id, vpc_id)
