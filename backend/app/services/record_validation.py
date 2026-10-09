"""Semantic validation of a record payload -> normalised column values.

Pure function of (zone, payload); database-dependent rules (conflicts, health check
lookup, alias target existence) are enforced in ``record_service``.
"""
import re

from app.core.errors import ValidationFailure, field_error
from app.dns import validators as v
from app.dns.constants import (
    ALIAS_RECORD_TYPES,
    ALIAS_TARGET_TYPES,
    AWS_REGIONS,
    CONTINENTS,
    DEFAULT_TTL,
    MAX_VALUES_PER_RECORD,
    ROUTING_POLICIES,
    USER_RECORD_TYPES,
)
from app.schemas.record import RecordIn


def normalize_record(zone_name: str, zone_id: str, payload: RecordIn, *, allow_soa: bool = False) -> dict:
    """Validate ``payload`` and return model column values. Raises ``ValidationFailure``."""
    errors: list[dict[str, str]] = []

    def check(field: str, fn, *args):
        try:
            return fn(*args)
        except v.DnsValueError as exc:
            errors.append(field_error(field, str(exc)))
            return None

    rtype = (payload.type or "").strip().upper()
    allowed = (*USER_RECORD_TYPES, "SOA") if allow_soa else USER_RECORD_TYPES
    if rtype not in allowed:
        errors.append(field_error("type", f"Record type '{payload.type}' is not supported. Use one of: {', '.join(USER_RECORD_TYPES)}."))

    name = check("name", v.to_fqdn, payload.name, zone_name)
    if rtype == "CNAME" and name == f"{zone_name}.":
        errors.append(field_error("name", "A CNAME record cannot be created at the zone apex."))

    out: dict = {"name": name, "type": rtype}

    # ---- routing ---------------------------------------------------------
    policy = (payload.routing_policy or "simple").lower()
    set_id = (payload.set_identifier or "").strip()
    out.update(
        routing_policy=policy, set_identifier=set_id, weight=None, region=None, failover=None,
        geo_continent=None, geo_country=None, geo_subdivision=None, cidr_collection_id=None, cidr_location=None,
    )  # fmt: skip
    if policy not in ROUTING_POLICIES:
        errors.append(field_error("routing_policy", f"Routing policy must be one of: {', '.join(ROUTING_POLICIES)}."))
    elif policy == "simple":
        if set_id:
            errors.append(field_error("set_identifier", "A record ID is only used with non-simple routing policies."))
    else:
        if not set_id:
            errors.append(field_error("set_identifier", "Record ID is required for this routing policy."))
        elif len(set_id) > 128:
            errors.append(field_error("set_identifier", "Record ID cannot exceed 128 characters."))
        _validate_policy_fields(policy, payload, out, errors)

    # ---- alias vs. standard values ---------------------------------------
    if payload.alias is not None:
        _validate_alias(rtype, zone_id, zone_name, payload, out, errors)
    else:
        out.update(alias_target=None, alias_target_type=None, alias_hosted_zone_id=None, evaluate_target_health=False)
        ttl = payload.ttl if payload.ttl is not None else DEFAULT_TTL
        out["ttl"] = check("ttl", v.validate_ttl, ttl)
        out["values"] = _validate_values(rtype, payload.values, policy, errors)

    out["health_check_id"] = (payload.health_check_id or "").strip() or None
    if errors:
        raise ValidationFailure(errors[0]["message"] if len(errors) == 1 else "The record contains invalid values.", errors)
    return out


def _validate_values(rtype: str, raw_values: list[str], policy: str, errors: list) -> list[str]:
    cleaned = [x for x in (s.strip() for s in raw_values) if x]
    if not cleaned:
        errors.append(field_error("values", "At least one value is required."))
        return []
    if len(cleaned) > MAX_VALUES_PER_RECORD:
        errors.append(field_error("values", f"A record can have at most {MAX_VALUES_PER_RECORD} values."))
    if rtype == "CNAME" and len(cleaned) > 1:
        errors.append(field_error("values", "A CNAME record can only have a single value."))
    if policy == "multivalue" and len(cleaned) > 1:
        errors.append(field_error("values", "A multivalue answer record can only have a single value; create one record per answer."))
    canonical: list[str] = []
    for index, raw in enumerate(cleaned):
        try:
            value = v.canonical_value(rtype, raw) if rtype else raw
        except v.DnsValueError as exc:
            errors.append(field_error(f"values[{index}]", str(exc)))
            continue
        if value in canonical:
            errors.append(field_error(f"values[{index}]", f"Duplicate value '{raw}'."))
        else:
            canonical.append(value)
    return canonical


def _validate_policy_fields(policy: str, payload: RecordIn, out: dict, errors: list) -> None:
    if policy == "ipbased":
        collection = (payload.cidr_collection_id or "").strip()
        location = (payload.cidr_location or "").strip()
        if not collection:
            errors.append(field_error("cidr_collection_id", "Choose a CIDR collection."))
        if not location:
            errors.append(field_error("cidr_location", "Choose a location, or * for the default."))
        out.update(cidr_collection_id=collection or None, cidr_location=location or None)
    elif policy == "weighted":
        if payload.weight is None or not 0 <= payload.weight <= 255:
            errors.append(field_error("weight", "Weight must be a whole number between 0 and 255."))
        else:
            out["weight"] = payload.weight
    elif policy == "latency":
        if payload.region not in AWS_REGIONS:
            errors.append(field_error("region", "Choose a valid AWS region for latency routing."))
        else:
            out["region"] = payload.region
    elif policy == "failover":
        failover = (payload.failover or "").upper()
        if failover not in ("PRIMARY", "SECONDARY"):
            errors.append(field_error("failover", "Failover record type must be Primary or Secondary."))
        else:
            out["failover"] = failover
    elif policy == "geolocation":
        continent = (payload.geo_continent or "").upper() or None
        country = (payload.geo_country or "").upper() or None
        subdivision = (payload.geo_subdivision or "").upper() or None
        if continent and country:
            errors.append(field_error("geo_country", "Specify either a continent or a country, not both."))
        elif not continent and not country:
            errors.append(field_error("geo_country", "Choose a location: a continent, a country, or Default (*)."))
        if continent and continent not in CONTINENTS:
            errors.append(field_error("geo_continent", "Unknown continent code."))
        if country and country != "*" and not re.fullmatch(r"[A-Z]{2}", country):
            errors.append(field_error("geo_country", "Country must be a two-letter ISO code or * for Default."))
        if subdivision and (country != "US" or not re.fullmatch(r"[A-Z0-9]{1,3}", subdivision)):
            errors.append(field_error("geo_subdivision", "Subdivision is only supported for country US (for example CA, NY)."))
        out.update(geo_continent=continent, geo_country=country, geo_subdivision=subdivision)
    # multivalue needs only the record ID, enforced above


def _validate_alias(rtype: str, zone_id: str, zone_name: str, payload: RecordIn, out: dict, errors: list) -> None:
    alias = payload.alias
    assert alias is not None
    out.update(ttl=None, values=[])
    if rtype not in ALIAS_RECORD_TYPES:
        errors.append(field_error("alias", f"Alias is only supported for {', '.join(ALIAS_RECORD_TYPES)} records."))
    if payload.values:
        errors.append(field_error("values", "An alias record cannot also have values."))
    if alias.target_type not in ALIAS_TARGET_TYPES:
        errors.append(field_error("alias.target_type", "Unsupported alias target type."))
        return
    try:
        if alias.target_type == "record":
            target = v.to_fqdn(alias.target, zone_name)
        else:
            target = v.normalize_hostname(alias.target, field="Alias target")
    except v.DnsValueError as exc:
        errors.append(field_error("alias.target", str(exc)))
        return
    out.update(
        alias_target=target,
        alias_target_type=alias.target_type,
        alias_hosted_zone_id=ALIAS_TARGET_TYPES[alias.target_type][1] or zone_id,
        evaluate_target_health=alias.evaluate_target_health,
    )
