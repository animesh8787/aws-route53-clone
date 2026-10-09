from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

HealthCheckType = Literal["HTTP", "HTTPS", "HTTP_STR_MATCH", "HTTPS_STR_MATCH", "TCP"]


class HealthCheckIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: HealthCheckType = "HTTP"
    endpoint: str
    port: int = 80
    path: str = "/"
    search_string: str | None = None
    request_interval: int = 30
    failure_threshold: int = 3
    regions: list[str] = Field(default_factory=list)
    inverted: bool = False
    disabled: bool = False


class HealthCheckOut(HealthCheckIn):
    id: int
    health_check_id: str
    status: str
    history: list[dict[str, Any]]
    created_at: datetime
    record_count: int = 0


class HealthCheckStatusUpdate(BaseModel):
    status: Literal["HEALTHY", "UNHEALTHY"]
    note: str = Field(default="", max_length=200)
