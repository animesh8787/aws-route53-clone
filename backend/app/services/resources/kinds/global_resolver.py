"""Route 53 Global Resolver (anycast resolvers), DNS views shared with the account, and Resolver on Outposts."""
import hashlib
import re

from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.errors import ValidationFailure, field_error
from app.dns.constants import AWS_REGIONS
from app.models import Resource, User
from app.services.resources.base import ResourceKind
from app.services.resources.kinds.resolver import check_name
from app.services.resources.registry import register

OUTPOST_ARN_RE = re.compile(r"^arn:aws:outposts:([a-z]{2}-[a-z]+-\d):(\d{12}):outpost/(op-[0-9a-f]{17})$")
INSTANCE_TYPE_RE = re.compile(r"^[a-z][a-z0-9]*\.[a-z0-9]+$")
ACCOUNT_RE = re.compile(r"^\d{12}$")


def _digest(public_id: str) -> bytes:
    return hashlib.sha256(public_id.encode()).digest()


def _check_region(value: str) -> str:
    if value not in AWS_REGIONS:
        raise ValueError(f"Unknown Region: {value}.")
    return value


def _account(db: Session, resource: Resource) -> str:
    owner = db.get(User, resource.owner_id)
    return owner.account_id if owner else "000000000000"


# --------------------------------------------------------------------------- global resolvers
class GlobalResolverPayload(BaseModel):
    name: str
    description: str = Field(default="", max_length=256)
    observability_region: str = "us-east-1"
    regions: list[str] = Field(default_factory=lambda: ["us-east-1", "eu-west-1"])
    ip_address_type: str = "IPV4"

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return check_name(value)

    @field_validator("observability_region")
    @classmethod
    def _observability(cls, value: str) -> str:
        return _check_region(value)

    @field_validator("ip_address_type")
    @classmethod
    def _ip_type(cls, value: str) -> str:
        if value not in ("IPV4", "DUALSTACK"):
            raise ValueError("Choose IPV4 or DUALSTACK.")
        return value


def _validate_global(_db: Session, _owner: int, data: dict, _existing: Resource | None) -> dict:
    data["regions"] = list(dict.fromkeys(data["regions"]))
    errors = []
    if not data["regions"]:
        errors.append(field_error("regions", "Choose at least one Region."))
    elif len(data["regions"]) > 10:
        errors.append(field_error("regions", "A global resolver can serve at most 10 Regions."))
    unknown = [r for r in data["regions"] if r not in AWS_REGIONS]
    if unknown:
        errors.append(field_error("regions", f"Unknown Region: {unknown[0]}."))
    if errors:
        raise ValidationFailure(errors[0]["message"], errors)
    return data


def _present_global(db: Session, resource: Resource, flat: dict) -> dict:
    """Anycast addresses and the DNS name are allocated deterministically from the resolver ID."""
    d = _digest(resource.public_id)
    ipv4 = [f"15.197.{d[0]}.{d[1] or 1}", f"3.33.{d[2]}.{d[3] or 1}"]
    ipv6 = [f"2600:9000:a{d[4]:02x}{d[5]:02x}::{d[6] or 1:x}", f"2600:9000:b{d[7]:02x}{d[8]:02x}::{d[9] or 1:x}"] if flat.get("ip_address_type") == "DUALSTACK" else []
    return {
        "ipv4_addresses": ipv4,
        "ipv6_addresses": ipv6,
        "dns_name": f"{resource.public_id}.globalresolver.route53.aws",
        "arn": f"arn:aws:route53globalresolver::{_account(db, resource)}:global-resolver/{resource.public_id}",
    }


register(
    ResourceKind(
        kind="global_resolver", label="Global resolver", id_prefix="gr", href="/global-resolvers", payload=GlobalResolverPayload,
        default_status="OPERATIONAL", validate=_validate_global, present=_present_global, sort_keys=("observability_region",),
    )
)  # fmt: skip


# --------------------------------------------------------------------------- DNS views shared through AWS RAM (read-only)
class SharedDnsViewPayload(BaseModel):
    name: str
    description: str = ""
    owner_account_id: str = "111122223333"
    dnssec_validation: bool = True
    edns_client_subnet: bool = False
    firewall_fail_open: bool = False


def _no_changes(_db: Session, _owner: int, _data: dict, _existing: Resource | None) -> dict:
    raise ValidationFailure("DNS views are shared with your account by their owner through AWS Resource Access Manager (RAM). They cannot be created or changed here.")


register(
    ResourceKind(
        kind="shared_dns_view", label="Shared DNS view", id_prefix="dnsview", href="/shared-dns-views", payload=SharedDnsViewPayload,
        default_status="ACTIVE", validate=_no_changes, deletable=False,
    )
)  # fmt: skip


# --------------------------------------------------------------------------- Resolver on Outposts
class OutpostResolverPayload(BaseModel):
    name: str
    outpost_arn: str
    instance_count: int = Field(default=4, ge=4, le=12)
    preferred_instance_type: str = "m5.large"

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return check_name(value)

    @field_validator("outpost_arn")
    @classmethod
    def _arn(cls, value: str) -> str:
        value = value.strip()
        if not OUTPOST_ARN_RE.match(value):
            raise ValueError("Enter an Outpost ARN such as arn:aws:outposts:us-east-1:123456789012:outpost/op-0123456789abcdef0.")
        return value

    @field_validator("preferred_instance_type")
    @classmethod
    def _instance(cls, value: str) -> str:
        if not INSTANCE_TYPE_RE.match(value.strip()):
            raise ValueError("Enter an instance type such as m5.large.")
        return value.strip()


def _present_outpost(_db: Session, resource: Resource, flat: dict) -> dict:
    match = OUTPOST_ARN_RE.match(flat.get("outpost_arn", ""))
    region = match.group(1) if match else "us-east-1"
    short = "".join(part[0] for part in region.split("-")[:2]) + region.split("-")[2]  # us-east-1 -> ue1
    d = _digest(resource.public_id)
    return {
        "outpost_id": match.group(3) if match else "-",
        "outpost_region": region,
        "availability_zone_id": f"{short}-az{d[0] % 6 + 1}",
        "outpost_generation": "2",
        "endpoint_count": 0,
        "resolver_type": "OUTPOST",
    }


register(
    ResourceKind(
        kind="resolver_outpost", label="Resolver on Outpost", id_prefix="rslvr-op", href="/resolver-outposts", payload=OutpostResolverPayload,
        default_status="OPERATIONAL", present=_present_outpost, filters=("preferred_instance_type",),
    )
)  # fmt: skip
