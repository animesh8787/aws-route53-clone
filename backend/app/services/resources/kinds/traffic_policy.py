"""Traffic policies: versioned JSON documents describing how to route traffic between endpoints.

Supported (a deliberate subset of the Route 53 traffic policy format): a start endpoint, or a start
rule of type failover, weighted, latency, geo or multivalue whose targets are endpoints. Rules cannot
reference other rules (no nesting) because each rule is materialised into ordinary routing records.
"""
import json
import re
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, ValidationFailure, field_error
from app.dns import validators as v
from app.dns.constants import AWS_REGIONS, CONTINENTS
from app.models import Resource
from app.services.resources.base import ResourceKind
from app.services.resources.registry import register

RECORD_TYPES = ("A", "AAAA", "CNAME", "MX", "NS", "PTR", "SRV", "TXT")
ENDPOINT_TYPES = {"value": None, "elastic-load-balancer": "elb", "cloudfront": "cloudfront", "s3-website": "s3-website"}
ALIAS_ALLOWED_TYPES = ("A", "AAAA")
RULE_TYPES = ("failover", "weighted", "latency", "geo", "multivalue")
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$")
MAX_DOCUMENT_BYTES = 100_000


class TrafficPolicyPayload(BaseModel):
    name: str
    description: str = Field(default="", max_length=256)
    record_type: str = "A"
    document: str | dict[str, Any]
    version_comment: str = Field(default="", max_length=256)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        if not NAME_RE.match(value.strip()):
            raise ValueError("Use 1-64 letters, digits, spaces, dots, hyphens or underscores, starting with a letter or digit.")
        return value

    @field_validator("record_type")
    @classmethod
    def _type(cls, value: str) -> str:
        if value.upper() not in RECORD_TYPES:
            raise ValueError(f"DNS type must be one of {', '.join(RECORD_TYPES)}.")
        return value.upper()


# --------------------------------------------------------------------------- document validation
def _value_error(rtype: str, value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return "Value must be a non-empty string."
    try:
        v.canonical_value(rtype, value)
    except v.DnsValueError as exc:
        return str(exc)
    return None


def _check_reference(ref: Any, endpoints: dict, path: str, errors: list[str], used: set[str]) -> None:
    if not isinstance(ref, str) or ref not in endpoints:
        errors.append(f"{path}: references the unknown endpoint '{ref}'.")
    else:
        used.add(ref)


def _check_target(item: Any, endpoints: dict, path: str, errors: list[str], used: set[str]) -> None:
    if not isinstance(item, dict):
        errors.append(f"{path}: must be an object.")
        return
    if "RuleReference" in item:
        errors.append(f"{path}: nested rules (RuleReference) are not supported in this console.")
        return
    _check_reference(item.get("EndpointReference"), endpoints, f"{path}.EndpointReference", errors, used)


def document_errors(doc: Any, rtype: str) -> list[str]:
    """Return every problem found in the policy document (empty list means valid)."""
    errors: list[str] = []
    if not isinstance(doc, dict):
        return ["Document must be a JSON object."]
    if doc.get("AWSPolicyFormatVersion", "2015-10-01") != "2015-10-01":
        errors.append("AWSPolicyFormatVersion must be '2015-10-01'.")
    if doc.get("RecordType", rtype) != rtype:
        errors.append(f"RecordType '{doc.get('RecordType')}' does not match the policy DNS type '{rtype}'.")

    endpoints = doc.get("Endpoints", {})
    if not isinstance(endpoints, dict) or not endpoints:
        errors.append("Endpoints must be an object with at least one endpoint.")
        endpoints = {}
    for eid, ep in endpoints.items():
        path = f"Endpoints.{eid}"
        if not isinstance(ep, dict):
            errors.append(f"{path}: must be an object with Type and Value.")
            continue
        etype = ep.get("Type")
        if etype not in ENDPOINT_TYPES:
            errors.append(f"{path}.Type: must be one of {', '.join(ENDPOINT_TYPES)}.")
        elif etype == "value":
            problem = _value_error(rtype, ep.get("Value"))
            if problem:
                errors.append(f"{path}.Value: {problem}")
        elif rtype not in ALIAS_ALLOWED_TYPES:
            errors.append(f"{path}.Type: '{etype}' endpoints are only supported for A and AAAA policies.")
        else:
            try:
                v.normalize_hostname(str(ep.get("Value", "")), field="Value")
            except v.DnsValueError as exc:
                errors.append(f"{path}.Value: {exc}")

    start_ep, start_rule = doc.get("StartEndpoint"), doc.get("StartRule")
    rules = doc.get("Rules", {})
    if (start_ep is None) == (start_rule is None):
        errors.append("Specify exactly one of StartEndpoint or StartRule.")
        return errors
    used: set[str] = set()
    if start_ep is not None:
        _check_reference(start_ep, endpoints, "StartEndpoint", errors, used)
        if rules:
            errors.append("Rules are only used with StartRule.")
    else:
        if not isinstance(rules, dict) or start_rule not in rules:
            errors.append(f"StartRule '{start_rule}' is not defined in Rules.")
            return errors
        if len(rules) > 1:
            errors.append("Only one rule is supported (rules cannot be nested in this console).")
        rule = rules[start_rule]
        errors.extend(_rule_errors(rule, endpoints, f"Rules.{start_rule}", used, rtype))
    for eid in endpoints:
        if eid not in used:
            errors.append(f"Endpoints.{eid}: is defined but never used.")
    return errors


def _rule_errors(rule: Any, endpoints: dict, path: str, used: set[str], rtype: str) -> list[str]:
    errors: list[str] = []
    if not isinstance(rule, dict):
        return [f"{path}: must be an object."]
    kind = rule.get("RuleType")
    if kind not in RULE_TYPES:
        return [f"{path}.RuleType: must be one of {', '.join(RULE_TYPES)}."]
    if kind == "failover":
        for role in ("Primary", "Secondary"):
            if role not in rule:
                errors.append(f"{path}.{role}: is required for failover rules.")
            else:
                _check_target(rule[role], endpoints, f"{path}.{role}", errors, used)
    elif kind in ("weighted", "multivalue"):
        items = rule.get("Items")
        if not isinstance(items, list) or len(items) < (2 if kind == "weighted" else 1):
            errors.append(f"{path}.Items: needs at least {2 if kind == 'weighted' else 1} item(s).")
            items = []
        if kind == "multivalue" and len(items) > 8:
            errors.append(f"{path}.Items: multivalue rules support at most 8 items.")
        for i, item in enumerate(items):
            _check_target(item, endpoints, f"{path}.Items[{i}]", errors, used)
            if kind == "weighted" and isinstance(item, dict):
                weight = item.get("Weight")
                if not isinstance(weight, int) or isinstance(weight, bool) or not 0 <= weight <= 255:
                    errors.append(f"{path}.Items[{i}].Weight: must be a whole number between 0 and 255.")
            if kind == "multivalue" and isinstance(item, dict) and endpoints.get(item.get("EndpointReference"), {}).get("Type") != "value":
                errors.append(f"{path}.Items[{i}]: multivalue rules only support 'value' endpoints.")
    elif kind == "latency":
        regions = rule.get("Regions")
        if not isinstance(regions, list) or len(regions) < 1:
            errors.append(f"{path}.Regions: needs at least one region.")
            regions = []
        seen = set()
        for i, item in enumerate(regions):
            _check_target(item, endpoints, f"{path}.Regions[{i}]", errors, used)
            region = item.get("Region") if isinstance(item, dict) else None
            if region not in AWS_REGIONS:
                errors.append(f"{path}.Regions[{i}].Region: '{region}' is not a supported AWS Region.")
            elif region in seen:
                errors.append(f"{path}.Regions[{i}].Region: duplicate region '{region}'.")
            seen.add(region)
    elif kind == "geo":
        locations = rule.get("Locations")
        if not isinstance(locations, list) or len(locations) < 1:
            errors.append(f"{path}.Locations: needs at least one location.")
            locations = []
        seen = set()
        for i, item in enumerate(locations):
            _check_target(item, endpoints, f"{path}.Locations[{i}]", errors, used)
            if not isinstance(item, dict):
                continue
            if item.get("IsDefault"):
                key = "*"
            elif "Continent" in item:
                key = f"continent:{item['Continent']}"
                if item["Continent"] not in CONTINENTS:
                    errors.append(f"{path}.Locations[{i}].Continent: unknown continent code '{item['Continent']}'.")
            elif "Country" in item:
                key = f"country:{item['Country']}"
                if not re.fullmatch(r"[A-Z]{2}", str(item["Country"])):
                    errors.append(f"{path}.Locations[{i}].Country: must be a two-letter ISO country code.")
            else:
                errors.append(f"{path}.Locations[{i}]: needs IsDefault, Continent or Country.")
                continue
            if key in seen:
                errors.append(f"{path}.Locations[{i}]: duplicate location.")
            seen.add(key)
    return errors


# --------------------------------------------------------------------------- materialisation plan
def record_plan(doc: dict, rtype: str) -> list[dict]:
    """Translate a valid document into the routing records that implement it (one dict per record)."""
    endpoints = doc["Endpoints"]

    def target(ref: str) -> dict:
        ep = endpoints[ref]
        if ep["Type"] == "value":
            return {"values": [ep["Value"]], "alias": None}
        return {"values": [], "alias": {"target": ep["Value"], "target_type": ENDPOINT_TYPES[ep["Type"]], "evaluate_target_health": False}}

    if "StartEndpoint" in doc:
        return [{"routing_policy": "simple", "set_identifier": None, **target(doc["StartEndpoint"])}]
    rule = doc["Rules"][doc["StartRule"]]
    kind = rule["RuleType"]
    plan: list[dict] = []
    if kind == "failover":
        for role in ("Primary", "Secondary"):
            item = rule[role]
            plan.append({"routing_policy": "failover", "set_identifier": role.lower(), "failover": role.upper(), "health_check_id": item.get("HealthCheck"), **target(item["EndpointReference"])})
    elif kind in ("weighted", "multivalue"):
        for i, item in enumerate(rule["Items"], start=1):
            entry = {"routing_policy": "multivalue" if kind == "multivalue" else "weighted", "set_identifier": f"{item['EndpointReference']}-{i}", "health_check_id": item.get("HealthCheck"), **target(item["EndpointReference"])}
            if kind == "weighted":
                entry["weight"] = item["Weight"]
            plan.append(entry)
    elif kind == "latency":
        for item in rule["Regions"]:
            plan.append({"routing_policy": "latency", "set_identifier": item["Region"], "region": item["Region"], "health_check_id": item.get("HealthCheck"), **target(item["EndpointReference"])})
    elif kind == "geo":
        for i, item in enumerate(rule["Locations"], start=1):
            entry = {"routing_policy": "geolocation", "set_identifier": f"geo-{i}", "health_check_id": item.get("HealthCheck"), **target(item["EndpointReference"])}
            if item.get("IsDefault"):
                entry["geo_country"] = "*"
            elif "Continent" in item:
                entry["geo_continent"] = item["Continent"]
            else:
                entry["geo_country"] = item["Country"]
            plan.append(entry)
    return plan


# --------------------------------------------------------------------------- resource kind
def _parse_document(raw: Any) -> Any:
    if isinstance(raw, dict):
        return raw
    if len(raw.encode()) > MAX_DOCUMENT_BYTES:
        raise ValidationFailure("The document is too large.", [field_error("document", "The document is too large (limit 100 KB).")])
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        msg = f"Document is not valid JSON (line {exc.lineno}, column {exc.colno}): {exc.msg}."
        raise ValidationFailure(msg, [field_error("document", msg)]) from exc


def _validate(db: Session, owner_id: int, data: dict, existing: Resource | None) -> dict:
    doc = _parse_document(data.pop("document"))
    comment = data.pop("version_comment", "")
    if existing is not None:
        data["record_type"] = existing.data["record_type"]  # the DNS type of a policy never changes
    problems = document_errors(doc, data["record_type"])
    if problems:
        raise ValidationFailure(problems[0], [field_error("document", p) for p in problems])
    doc.setdefault("AWSPolicyFormatVersion", "2015-10-01")
    doc.setdefault("RecordType", data["record_type"])
    versions = list(existing.data.get("versions", [])) if existing else []
    if not versions or versions[-1]["document"] != doc:
        versions.append({"version": len(versions) + 1, "document": doc, "comment": comment, "created_at": datetime.utcnow().isoformat(timespec="seconds")})
    data["versions"] = versions
    data["latest_version"] = versions[-1]["version"]
    return data


def _guard_delete(db: Session, owner_id: int, resource: Resource) -> None:
    users = [r.name for r in db.scalars(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == "policy_record")) if r.data.get("policy_id") == resource.public_id]
    if users:
        raise ConflictError(f"This policy is used by {len(users)} policy record(s) ({users[0]}...). Delete those first.")


def _present(db: Session, resource: Resource, flat: dict) -> dict:
    latest = flat["versions"][-1]
    count = sum(1 for r in db.scalars(select(Resource).where(Resource.owner_id == resource.owner_id, Resource.kind == "policy_record")) if r.data.get("policy_id") == resource.public_id)
    return {"document": json.dumps(latest["document"], indent=2), "version_count": len(flat["versions"]), "policy_record_count": count}


traffic_policy = register(
    ResourceKind(
        kind="traffic_policy", label="Traffic policy", id_prefix="tp", href="/traffic-policies", payload=TrafficPolicyPayload,
        default_status="ACTIVE", validate=_validate, guard_delete=_guard_delete, present=_present, sort_keys=("record_type",), filters=("record_type",),
    )
)
