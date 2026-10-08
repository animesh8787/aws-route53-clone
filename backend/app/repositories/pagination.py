from math import ceil
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

MAX_PAGE_SIZE = 200


def paginate(db: Session, query: Select, page: int, page_size: int) -> tuple[list[Any], int]:
    """Run ``query`` with LIMIT/OFFSET and return ``(rows, total_matching)``."""
    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    rows = db.scalars(query.limit(page_size).offset((page - 1) * page_size)).unique().all()
    return list(rows), total


def page_count(total: int, page_size: int) -> int:
    return max(ceil(total / max(page_size, 1)), 1)
