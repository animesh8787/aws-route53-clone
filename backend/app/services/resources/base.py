"""Declarative description of a console resource kind (profile, resolver rule, firewall rule group...)."""
from collections.abc import Callable
from dataclasses import dataclass, field

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models import Resource

# validate(db, owner_id, data, existing) -> normalised data dict; raises ValidationFailure / ConflictError
Validator = Callable[[Session, int, dict, "Resource | None"], dict]
# guard(db, owner_id, resource) -> None; raises ConflictError to block deletion
Guard = Callable[[Session, int, Resource], None]
# hook(db, owner_id, resource) -> None; side effects inside the caller's transaction
Hook = Callable[[Session, int, Resource], None]


@dataclass
class ResourceKind:
    kind: str  # URL segment and DB discriminator, e.g. "profile"
    label: str  # human name used in messages, e.g. "Profile"
    id_prefix: str  # public id prefix, e.g. "rp" -> rp-0a1b...
    href: str  # console path of the list page, e.g. "/profiles"
    payload: type[BaseModel]  # Pydantic model of the user-editable fields (must include ``name``)
    default_status: str | None = None
    filters: tuple[str, ...] = ()  # data keys that may be filtered with ?filter_<key>=value
    sort_keys: tuple[str, ...] = ()  # data keys that may be sorted on (besides name/status/created_at)
    validate: Validator | None = None
    guard_delete: Guard | None = None
    after_create: Hook | None = None
    after_delete: Hook | None = None
    extra: dict = field(default_factory=dict)
