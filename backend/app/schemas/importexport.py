from typing import Literal

from pydantic import BaseModel, Field


class ImportRequest(BaseModel):
    content: str = Field(min_length=1)
    dry_run: bool = True
    skip_invalid: bool = False


class ImportItem(BaseModel):
    line: int
    name: str
    type: str
    ttl: int
    values: list[str]
    status: Literal["ok", "error", "skipped"]
    message: str | None = None


class ImportResult(BaseModel):
    dry_run: bool
    committed: bool
    created: int
    valid: int
    errors: int
    skipped: int
    items: list[ImportItem]
