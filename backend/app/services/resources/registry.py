from app.core.errors import NotFoundError
from app.services.resources.base import ResourceKind

_KINDS: dict[str, ResourceKind] = {}


def register(kind: ResourceKind) -> ResourceKind:
    _KINDS[kind.kind] = kind
    return kind


def get_kind(name: str) -> ResourceKind:
    if not _KINDS:
        from app.services.resources import kinds  # noqa: F401  (importing registers every kind)
    kind = _KINDS.get(name)
    if kind is None:
        raise NotFoundError(f"Unknown resource type '{name}'.")
    return kind


def all_kinds() -> list[ResourceKind]:
    get_kind("profile")  # ensure registration
    return list(_KINDS.values())
