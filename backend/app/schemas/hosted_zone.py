from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class VpcIn(BaseModel):
    vpc_id: str = Field(min_length=1, max_length=32)
    region: str = Field(min_length=1, max_length=32)


class VpcOut(VpcIn):
    pass


class HostedZoneCreate(BaseModel):
    name: str
    comment: str = Field(default="", max_length=256)
    type: Literal["public", "private"] = "public"
    vpc: VpcIn | None = None


class HostedZoneUpdate(BaseModel):
    comment: str = Field(max_length=256)


class HostedZoneOut(BaseModel):
    id: int
    zone_id: str
    name: str
    type: Literal["public", "private"]
    comment: str
    record_count: int
    created_by: str
    created_at: datetime
    updated_at: datetime
    name_servers: list[str]
    vpcs: list[VpcOut]
    tags: list[dict[str, str]] = []
    dnssec_status: str = "NOT_SIGNING"
