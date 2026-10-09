"""CIDR collections for IP-based routing: named locations, each a set of IPv4/IPv6 CIDR blocks."""
import ipaddress
import re

from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, ValidationFailure, field_error
from app.models import DnsRecord, Resource
from app.services.resources.base import ResourceKind
from app.services.resources.registry import register

NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$")
LOCATION_RE = re.compile(r"^[A-Za-z0-9_-]{1,16}$")
MAX_LOCATIONS = 100
MAX_BLOCKS_PER_LOCATION = 1000


class Location(BaseModel):
    name: str
    cidr_blocks: list[str] = Field(default_factory=list)


class CidrCollectionPayload(BaseModel):
    name: str
    locations: list[Location] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        if not NAME_RE.match(value.strip()):
            raise ValueError("Use 1-64 letters, digits, spaces, dots, hyphens or underscores, starting with a letter or digit.")
        return value


def _validate(db: Session, owner_id: int, data: dict, existing: Resource | None) -> dict:
    errors: list[dict] = []
    seen_names: set[str] = set()
    networks: list[tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, str]] = []
    if len(data["locations"]) > MAX_LOCATIONS:
        errors.append(field_error("locations", f"A collection can have at most {MAX_LOCATIONS} locations."))
    for li, loc in enumerate(data["locations"]):
        name = loc["name"].strip()
        loc["name"] = name
        if name == "*" or not LOCATION_RE.match(name):
            errors.append(field_error(f"locations.{li}.name", "Location names use 1-16 letters, digits, underscores or hyphens ('*' is reserved for the default)."))
        elif name.lower() in seen_names:
            errors.append(field_error(f"locations.{li}.name", f"Duplicate location name '{name}'."))
        seen_names.add(name.lower())
        if not loc["cidr_blocks"]:
            errors.append(field_error(f"locations.{li}.cidr_blocks", f"Location '{name}' needs at least one CIDR block."))
        if len(loc["cidr_blocks"]) > MAX_BLOCKS_PER_LOCATION:
            errors.append(field_error(f"locations.{li}.cidr_blocks", f"A location can have at most {MAX_BLOCKS_PER_LOCATION} CIDR blocks."))
        normalised = []
        for block in loc["cidr_blocks"]:
            try:
                network = ipaddress.ip_network(block.strip(), strict=True)
            except ValueError:
                errors.append(field_error(f"locations.{li}.cidr_blocks", f"'{block.strip()}' is not a valid CIDR block (for example 192.0.2.0/24 or 2001:db8::/32; host bits must be zero)."))
                continue
            normalised.append(str(network))
            networks.append((network, name))
        loc["cidr_blocks"] = normalised
    for i, (a, a_loc) in enumerate(networks):
        for b, b_loc in networks[i + 1 :]:
            if a.version == b.version and a.overlaps(b):
                errors.append(field_error("locations", f"{a} (location '{a_loc}') overlaps {b} (location '{b_loc}'). CIDR blocks in a collection cannot overlap."))
                break
        if errors and errors[-1]["field"] == "locations":
            break
    if errors:
        raise ValidationFailure(errors[0]["message"], errors)
    return data


def _guard_delete(db: Session, owner_id: int, resource: Resource) -> None:
    used = db.scalar(select(func.count()).where(DnsRecord.cidr_collection_id == resource.public_id)) or 0
    if used:
        raise ConflictError(f"{used} record(s) use this collection for IP-based routing. Delete or change those records first.")


def _present(db: Session, resource: Resource, flat: dict) -> dict:
    locations = flat.get("locations", [])
    return {
        "location_count": len(locations),
        "cidr_count": sum(len(loc.get("cidr_blocks", [])) for loc in locations),
        "record_count": db.scalar(select(func.count()).where(DnsRecord.cidr_collection_id == resource.public_id)) or 0,
    }


cidr_collection = register(
    ResourceKind(
        kind="cidr_collection", label="CIDR collection", id_prefix="cidr", href="/cidr-collections", payload=CidrCollectionPayload,
        default_status="ACTIVE", validate=_validate, guard_delete=_guard_delete, present=_present,
    )
)
