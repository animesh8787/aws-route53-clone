"""Route 53 Profiles: a named bundle of VPC associations and DNS resources."""
import re

from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, ValidationFailure, field_error
from app.dns.mock_data import VPC_BY_ID
from app.models import HostedZone, Resource
from app.services.resources.base import ResourceKind
from app.services.resources.registry import register

NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$")
SHAREABLE_KINDS = ("resolver_rule", "fw_rule_group", "query_logging")


class ProfilePayload(BaseModel):
    name: str
    description: str = Field(default="", max_length=256)
    vpc_ids: list[str] = Field(default_factory=list)
    zone_ids: list[str] = Field(default_factory=list)  # private hosted zones
    resource_ids: list[str] = Field(default_factory=list)  # resolver rules, firewall rule groups, query logging configs

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        if not NAME_RE.match(value.strip()):
            raise ValueError("Use 1-64 letters, digits, spaces, dots, hyphens or underscores, starting with a letter or digit.")
        return value


def _validate(db: Session, owner_id: int, data: dict, existing: Resource | None) -> dict:
    errors = []
    for key in ("vpc_ids", "zone_ids", "resource_ids"):
        data[key] = list(dict.fromkeys(data[key]))
    unknown = [v for v in data["vpc_ids"] if v not in VPC_BY_ID]
    if unknown:
        errors.append(field_error("vpc_ids", f"Unknown VPC: {unknown[0]}."))
    if data["zone_ids"]:
        found = {z.zone_id: z for z in db.scalars(select(HostedZone).where(HostedZone.owner_id == owner_id, HostedZone.zone_id.in_(data["zone_ids"])))}
        for zone_id in data["zone_ids"]:
            zone = found.get(zone_id)
            if zone is None or not zone.is_private:
                errors.append(field_error("zone_ids", f"{zone_id} is not a private hosted zone."))
                break
    if data["resource_ids"]:
        owned = set(
            db.scalars(select(Resource.public_id).where(Resource.owner_id == owner_id, Resource.kind.in_(SHAREABLE_KINDS), Resource.public_id.in_(data["resource_ids"])))
        )
        missing = [r for r in data["resource_ids"] if r not in owned]
        if missing:
            errors.append(field_error("resource_ids", f"{missing[0]} is not a resolver rule, firewall rule group or query logging configuration."))
    if errors:
        raise ValidationFailure(errors[0]["message"], errors)
    # a VPC can belong to only one profile
    others = db.scalars(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == "profile", Resource.id != (existing.id if existing else 0)))
    for other in others:
        clash = set(other.data.get("vpc_ids", [])) & set(data["vpc_ids"])
        if clash:
            raise ConflictError(f"{sorted(clash)[0]} is already associated with the profile '{other.name}'.")
    return data


profile = register(
    ResourceKind(
        kind="profile", label="Profile", id_prefix="rp", href="/profiles", payload=ProfilePayload, default_status="COMPLETE", validate=_validate,
    )
)
