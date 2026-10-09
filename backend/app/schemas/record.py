from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AliasIn(BaseModel):
    target: str = ""
    target_type: str = "cloudfront"
    evaluate_target_health: bool = False


class AliasOut(AliasIn):
    hosted_zone_id: str | None = None


class RecordIn(BaseModel):
    """Create/update payload. Semantic validation lives in ``app.services.record_validation``."""

    name: str = ""
    type: str
    ttl: int | None = Field(default=None)
    values: list[str] = Field(default_factory=list)
    routing_policy: str = "simple"
    set_identifier: str | None = None
    weight: int | None = None
    region: str | None = None
    failover: str | None = None
    geo_continent: str | None = None
    geo_country: str | None = None
    geo_subdivision: str | None = None
    alias: AliasIn | None = None
    health_check_id: str | None = None


class RecordOut(BaseModel):
    id: int
    zone_id: str
    name: str
    type: str
    ttl: int | None
    values: list[str]
    parsed_values: list[dict[str, Any]]
    routing_policy: str
    set_identifier: str
    weight: int | None
    region: str | None
    failover: str | None
    geo_continent: str | None
    geo_country: str | None
    geo_subdivision: str | None
    alias: AliasOut | None
    health_check_id: str | None
    is_system: bool
    created_at: datetime
    updated_at: datetime


class BulkDeleteRequest(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)


class BulkDeleteResult(BaseModel):
    deleted: int
    skipped: list[dict[str, Any]]


class BulkTtlRequest(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)
    ttl: int


class BulkTtlResult(BaseModel):
    updated: int
    skipped: list[dict[str, Any]]
