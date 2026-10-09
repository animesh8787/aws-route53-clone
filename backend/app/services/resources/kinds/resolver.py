"""Route 53 Resolver: inbound / outbound endpoints, forwarding rules and query logging configurations."""
import ipaddress
import re

from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, ValidationFailure, field_error
from app.dns import validators as v
from app.dns.mock_data import VPC_BY_ID
from app.models import Resource
from app.services.resources.base import ResourceKind
from app.services.resources.registry import register

NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$")
SG_RE = re.compile(r"^sg-[0-9a-f]{8,17}$")
SUBNET_RE = re.compile(r"^subnet-[0-9a-f]{8,17}$")
PROTOCOLS = ("Do53", "DoH", "DoT")
RESERVED_HOSTS = 4  # AWS reserves the first four addresses of a subnet range
ARN_PATTERNS = {
    "cloudwatch-logs": re.compile(r"^arn:aws:logs:[a-z0-9-]+:\d{12}:log-group:[\w./#-]{1,512}(:\*)?$"),
    "s3": re.compile(r"^arn:aws:s3:::[a-z0-9.-]{3,63}(/.*)?$"),
    "firehose": re.compile(r"^arn:aws:firehose:[a-z0-9-]+:\d{12}:deliverystream/[\w.-]{1,64}$"),
}
ARN_EXAMPLES = {
    "cloudwatch-logs": "arn:aws:logs:us-east-1:123456789012:log-group:/route53/resolver-queries",
    "s3": "arn:aws:s3:::my-query-logs",
    "firehose": "arn:aws:firehose:us-east-1:123456789012:deliverystream/dns-logs",
}


def check_name(value: str) -> str:
    if not NAME_RE.match(value.strip()):
        raise ValueError("Use 1-64 letters, digits, spaces, dots, hyphens or underscores, starting with a letter or digit.")
    return value


def _vpc_errors(vpc_ids: list[str], field: str = "vpc_ids") -> list[dict]:
    unknown = [x for x in vpc_ids if x not in VPC_BY_ID]
    return [field_error(field, f"Unknown VPC: {unknown[0]}.")] if unknown else []


def _raise(errors: list[dict]) -> None:
    if errors:
        raise ValidationFailure(errors[0]["message"], errors)


# --------------------------------------------------------------------------- endpoints
class EndpointIp(BaseModel):
    subnet_id: str
    ip: str = ""


class EndpointPayload(BaseModel):
    name: str
    vpc_id: str
    security_group_ids: list[str] = Field(default_factory=list)
    ip_addresses: list[EndpointIp] = Field(default_factory=list)
    protocols: list[str] = Field(default_factory=lambda: ["Do53"])

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return check_name(value)


def _used_ips(db: Session, owner_id: int, vpc_id: str, exclude: int | None) -> set[str]:
    used: set[str] = set()
    rows = db.scalars(select(Resource).where(Resource.owner_id == owner_id, Resource.kind.in_(("resolver_inbound", "resolver_outbound"))))
    for res in rows:
        if res.id != exclude and res.data.get("vpc_id") == vpc_id:
            used.update(a["ip"] for a in res.data.get("ip_addresses", []))
    return used


def _validate_endpoint(direction: str):
    def validate(db: Session, owner_id: int, data: dict, existing: Resource | None) -> dict:
        errors: list[dict] = []
        vpc = VPC_BY_ID.get(data["vpc_id"])
        if vpc is None:
            _raise([field_error("vpc_id", f"Unknown VPC: {data['vpc_id']}.")])
        if existing is not None and existing.data["vpc_id"] != data["vpc_id"]:
            errors.append(field_error("vpc_id", "The VPC of an endpoint cannot be changed."))
        groups = list(dict.fromkeys(g.strip() for g in data["security_group_ids"] if g.strip()))
        if not groups:
            errors.append(field_error("security_group_ids", "Provide at least one security group ID (for example sg-0a1b2c3d)."))
        for g in groups:
            if not SG_RE.match(g):
                errors.append(field_error("security_group_ids", f"'{g}' is not a valid security group ID (sg- followed by 8-17 hex characters)."))
        data["security_group_ids"] = groups
        bad_protocols = [p for p in data["protocols"] if p not in PROTOCOLS]
        if bad_protocols or not data["protocols"]:
            errors.append(field_error("protocols", f"Choose one or more of: {', '.join(PROTOCOLS)}."))
        entries = data["ip_addresses"]
        if not 2 <= len(entries) <= 6:
            errors.append(field_error("ip_addresses", "An endpoint needs between 2 and 6 IP addresses (in different subnets for availability)."))
        network = ipaddress.ip_network(vpc["cidr"])
        taken = _used_ips(db, owner_id, data["vpc_id"], existing.id if existing else None)
        chosen: set[str] = set()
        next_host = RESERVED_HOSTS + 6
        for i, entry in enumerate(entries):
            if not SUBNET_RE.match(entry["subnet_id"].strip()):
                errors.append(field_error("ip_addresses", f"Address {i + 1}: '{entry['subnet_id']}' is not a valid subnet ID (subnet- followed by 8-17 hex characters)."))
            ip = entry["ip"].strip()
            if ip:
                try:
                    address = ipaddress.IPv4Address(ip)
                except ValueError:
                    errors.append(field_error("ip_addresses", f"Address {i + 1}: '{ip}' is not a valid IPv4 address."))
                    continue
                if address not in network or int(address) - int(network.network_address) < RESERVED_HOSTS or address == network.broadcast_address:
                    errors.append(field_error("ip_addresses", f"Address {i + 1}: {ip} is not a usable address inside {vpc['cidr']}."))
                    continue
            else:
                while str(network.network_address + next_host) in taken | chosen:
                    next_host += 1
                ip = str(network.network_address + next_host)
                next_host += 1
            if ip in taken or ip in chosen:
                errors.append(field_error("ip_addresses", f"Address {i + 1}: {ip} is already in use by another endpoint."))
            chosen.add(ip)
            entry["subnet_id"], entry["ip"] = entry["subnet_id"].strip(), ip
        _raise(errors)
        data["direction"] = direction
        return data

    return validate


def _guard_endpoint_delete(db: Session, owner_id: int, resource: Resource) -> None:
    users = [r.name for r in db.scalars(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == "resolver_rule")) if r.data.get("outbound_endpoint_id") == resource.public_id]
    if users:
        raise ConflictError(f"This endpoint is used by {len(users)} forwarding rule(s) ({users[0]}...). Delete or change those rules first.")


inbound = register(
    ResourceKind(
        kind="resolver_inbound", label="Inbound endpoint", id_prefix="rslvr-in", href="/resolver-inbound", payload=EndpointPayload,
        default_status="OPERATIONAL", validate=_validate_endpoint("INBOUND"), sort_keys=("vpc_id",),
    )
)
def _present_outbound(db: Session, resource: Resource, _flat: dict) -> dict:
    rules = db.scalars(select(Resource).where(Resource.owner_id == resource.owner_id, Resource.kind == "resolver_rule"))
    return {"rule_count": sum(1 for r in rules if r.data.get("outbound_endpoint_id") == resource.public_id)}


outbound = register(
    ResourceKind(
        kind="resolver_outbound", label="Outbound endpoint", id_prefix="rslvr-out", href="/resolver-outbound", payload=EndpointPayload,
        default_status="OPERATIONAL", validate=_validate_endpoint("OUTBOUND"), guard_delete=_guard_endpoint_delete, sort_keys=("vpc_id",), present=_present_outbound,
    )
)


# --------------------------------------------------------------------------- rules
class TargetIp(BaseModel):
    ip: str
    port: int = 53


class RulePayload(BaseModel):
    name: str
    rule_type: str = "FORWARD"
    domain_name: str = ""
    target_ips: list[TargetIp] = Field(default_factory=list)
    outbound_endpoint_id: str = ""
    vpc_ids: list[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return check_name(value)


def _validate_rule(db: Session, owner_id: int, data: dict, existing: Resource | None) -> dict:
    errors = _vpc_errors(data["vpc_ids"])
    data["vpc_ids"] = list(dict.fromkeys(data["vpc_ids"]))
    rule_type = data["rule_type"].upper()
    data["rule_type"] = rule_type
    if rule_type not in ("FORWARD", "SYSTEM", "RECURSIVE"):
        errors.append(field_error("rule_type", "Rule type must be FORWARD, SYSTEM or RECURSIVE."))
    if rule_type == "RECURSIVE":
        data["domain_name"] = "."
    else:
        try:
            domain = v.normalize_hostname(data["domain_name"], field="Domain name")
            if domain == ".":
                raise v.DnsValueError("Enter a domain name such as corp.example.com.")
            data["domain_name"] = domain.rstrip(".")
        except v.DnsValueError as exc:
            errors.append(field_error("domain_name", str(exc)))
    if rule_type == "FORWARD":
        targets = data["target_ips"]
        if not 1 <= len(targets) <= 6:
            errors.append(field_error("target_ips", "A forwarding rule needs between 1 and 6 target IP addresses."))
        for i, t in enumerate(targets):
            try:
                ipaddress.ip_address(t["ip"].strip())
            except ValueError:
                errors.append(field_error("target_ips", f"Target {i + 1}: '{t['ip']}' is not a valid IP address."))
            if not 1 <= t["port"] <= 65535:
                errors.append(field_error("target_ips", f"Target {i + 1}: port must be between 1 and 65535."))
            t["ip"] = t["ip"].strip()
        endpoint = db.scalar(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == "resolver_outbound", Resource.public_id == data["outbound_endpoint_id"]))
        if endpoint is None:
            errors.append(field_error("outbound_endpoint_id", "Choose an existing outbound endpoint."))
    else:
        data["target_ips"], data["outbound_endpoint_id"] = [], ""
    _raise(errors)
    others = db.scalars(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == "resolver_rule", Resource.id != (existing.id if existing else 0)))
    for other in others:
        same = other.data["domain_name"] == data["domain_name"]
        clash = set(other.data.get("vpc_ids", [])) & set(data["vpc_ids"])
        if same and clash:
            raise ConflictError(f"{sorted(clash)[0]} already has a rule for '{data['domain_name']}' ({other.name}).")
    return data


def _detach_from_profiles(db: Session, owner_id: int, resource: Resource) -> None:
    for profile in db.scalars(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == "profile")):
        if resource.public_id in profile.data.get("resource_ids", []):
            profile.data = {**profile.data, "resource_ids": [r for r in profile.data["resource_ids"] if r != resource.public_id]}


resolver_rule = register(
    ResourceKind(
        kind="resolver_rule", label="Resolver rule", id_prefix="rslvr-rr", href="/resolver-rules", payload=RulePayload, default_status="COMPLETE",
        validate=_validate_rule, after_delete=_detach_from_profiles, filters=("rule_type",), sort_keys=("domain_name", "rule_type"),
    )
)


# --------------------------------------------------------------------------- query logging
class QueryLoggingPayload(BaseModel):
    name: str
    destination_type: str = "cloudwatch-logs"
    destination_arn: str
    vpc_ids: list[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return check_name(value)


def _validate_query_logging(db: Session, owner_id: int, data: dict, existing: Resource | None) -> dict:
    errors = _vpc_errors(data["vpc_ids"])
    data["vpc_ids"] = list(dict.fromkeys(data["vpc_ids"]))
    pattern = ARN_PATTERNS.get(data["destination_type"])
    if pattern is None:
        errors.append(field_error("destination_type", "Destination must be cloudwatch-logs, s3 or firehose."))
    elif not pattern.match(data["destination_arn"].strip()):
        errors.append(field_error("destination_arn", f"Enter a valid ARN for this destination, for example {ARN_EXAMPLES[data['destination_type']]}."))
    data["destination_arn"] = data["destination_arn"].strip()
    _raise(errors)
    return data


query_logging = register(
    ResourceKind(
        kind="query_logging", label="Query logging configuration", id_prefix="rslvr-qlc", href="/resolver-query-logging", payload=QueryLoggingPayload,
        default_status="CREATED", validate=_validate_query_logging, after_delete=_detach_from_profiles, filters=("destination_type",), sort_keys=("destination_type",),
    )
)
