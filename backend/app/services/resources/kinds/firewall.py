"""DNS Firewall: domain lists and rule groups (allow / block / alert) associated with VPCs."""
import re

from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, field_error
from app.dns import validators as v
from app.models import Resource
from app.services.resources.base import ResourceKind
from app.services.resources.kinds.resolver import _detach_from_profiles, _raise, _vpc_errors, check_name
from app.services.resources.registry import register

MAX_DOMAINS = 10_000
ACTIONS = ("ALLOW", "BLOCK", "ALERT")
BLOCK_RESPONSES = ("NODATA", "NXDOMAIN", "OVERRIDE")


# --------------------------------------------------------------------------- domain lists
class DomainListPayload(BaseModel):
    name: str
    domains: list[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return check_name(value)


def normalize_pattern(raw: str) -> str:
    """A domain or a ``*.`` wildcard, lower-case and without the trailing dot."""
    text = raw.strip().lower().rstrip(".")
    wildcard = text.startswith("*.")
    base = text[2:] if wildcard else text
    v.normalize_hostname(base, field="Domain")
    if "." not in base and not wildcard:
        raise v.DnsValueError("Enter a fully qualified domain such as bad.example.com.")
    return f"*.{base}" if wildcard else base


def _validate_domain_list(db: Session, owner_id: int, data: dict, existing: Resource | None) -> dict:
    errors, seen = [], []
    for i, raw in enumerate(d for d in data["domains"] if d.strip()):
        try:
            pattern = normalize_pattern(raw)
        except v.DnsValueError as exc:
            errors.append(field_error("domains", f"Line {i + 1} ('{raw.strip()}'): {exc}"))
            continue
        if pattern not in seen:
            seen.append(pattern)
    if len(seen) > MAX_DOMAINS:
        errors.append(field_error("domains", f"A domain list can hold at most {MAX_DOMAINS:,} domains."))
    _raise(errors)
    data["domains"] = seen
    return data


def _guard_list_delete(db: Session, owner_id: int, resource: Resource) -> None:
    for group in db.scalars(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == "fw_rule_group")):
        if any(r["domain_list_id"] == resource.public_id for r in group.data.get("rules", [])):
            raise ConflictError(f"This domain list is used by the rule group '{group.name}'. Remove the rule first.")


def _present_list(db: Session, resource: Resource, flat: dict) -> dict:
    return {"domain_count": len(flat.get("domains", []))}


fw_domain_list = register(
    ResourceKind(
        kind="fw_domain_list", label="Domain list", id_prefix="rslvr-fdl", href="/dns-firewall-domain-lists", payload=DomainListPayload,
        default_status="COMPLETE", validate=_validate_domain_list, guard_delete=_guard_list_delete, present=_present_list,
    )
)


# --------------------------------------------------------------------------- rule groups
class FirewallRule(BaseModel):
    name: str
    priority: int
    domain_list_id: str
    action: str = "BLOCK"
    block_response: str = "NODATA"
    override_domain: str = ""
    override_ttl: int = 60


class Association(BaseModel):
    vpc_id: str
    priority: int = 101


class RuleGroupPayload(BaseModel):
    name: str
    description: str = Field(default="", max_length=256)
    rules: list[FirewallRule] = Field(default_factory=list)
    associations: list[Association] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return check_name(value)


def _validate_group(db: Session, owner_id: int, data: dict, existing: Resource | None) -> dict:
    errors: list[dict] = []
    lists = {r.public_id for r in db.scalars(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == "fw_domain_list"))}
    priorities: set[int] = set()
    names: set[str] = set()
    for i, rule in enumerate(data["rules"], start=1):
        rule["name"] = rule["name"].strip()
        if not re.match(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$", rule["name"]):
            errors.append(field_error("rules", f"Rule {i}: use 1-64 letters, digits, dots, hyphens or underscores for the name."))
        if rule["name"].lower() in names:
            errors.append(field_error("rules", f"Rule {i}: duplicate rule name '{rule['name']}'."))
        names.add(rule["name"].lower())
        if not 1 <= rule["priority"] <= 10000:
            errors.append(field_error("rules", f"Rule {i}: priority must be between 1 and 10000."))
        elif rule["priority"] in priorities:
            errors.append(field_error("rules", f"Rule {i}: priority {rule['priority']} is used by another rule in this group."))
        priorities.add(rule["priority"])
        if rule["domain_list_id"] not in lists:
            errors.append(field_error("rules", f"Rule {i}: domain list '{rule['domain_list_id']}' was not found."))
        rule["action"] = rule["action"].upper()
        if rule["action"] not in ACTIONS:
            errors.append(field_error("rules", f"Rule {i}: action must be ALLOW, BLOCK or ALERT."))
        if rule["action"] == "BLOCK":
            rule["block_response"] = rule["block_response"].upper()
            if rule["block_response"] not in BLOCK_RESPONSES:
                errors.append(field_error("rules", f"Rule {i}: block response must be NODATA, NXDOMAIN or OVERRIDE."))
            elif rule["block_response"] == "OVERRIDE":
                try:
                    rule["override_domain"] = v.normalize_hostname(rule["override_domain"], field="Override domain")
                except v.DnsValueError as exc:
                    errors.append(field_error("rules", f"Rule {i}: {exc}"))
                if not 0 <= rule["override_ttl"] <= 604800:
                    errors.append(field_error("rules", f"Rule {i}: override TTL must be between 0 and 604800 seconds."))
        else:
            rule["block_response"], rule["override_domain"] = "", ""
    errors += _vpc_errors([a["vpc_id"] for a in data["associations"]], "associations")
    seen_vpcs: set[str] = set()
    for a in data["associations"]:
        if a["vpc_id"] in seen_vpcs:
            errors.append(field_error("associations", f"{a['vpc_id']} is associated twice."))
        seen_vpcs.add(a["vpc_id"])
        if not 100 <= a["priority"] <= 9900:
            errors.append(field_error("associations", f"{a['vpc_id']}: association priority must be between 100 and 9900."))
    _raise(errors)
    others = db.scalars(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == "fw_rule_group", Resource.id != (existing.id if existing else 0)))
    for other in others:
        for a in other.data.get("associations", []):
            for mine in data["associations"]:
                if a["vpc_id"] == mine["vpc_id"] and a["priority"] == mine["priority"]:
                    raise ConflictError(f"{a['vpc_id']} already has the priority {a['priority']} in rule group '{other.name}'.")
    return data


def _present_group(db: Session, resource: Resource, flat: dict) -> dict:
    return {"rule_count": len(flat.get("rules", [])), "vpc_count": len(flat.get("associations", []))}


fw_rule_group = register(
    ResourceKind(
        kind="fw_rule_group", label="Rule group", id_prefix="rslvr-frg", href="/dns-firewall", payload=RuleGroupPayload, default_status="COMPLETE",
        validate=_validate_group, after_delete=_detach_from_profiles, present=_present_group,
    )
)


