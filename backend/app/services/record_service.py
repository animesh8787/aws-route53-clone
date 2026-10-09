"""DNS record business rules: validation, conflict detection, persistence."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import (
    ConflictError,
    NotFoundError,
    ProtectedError,
    ValidationFailure,
    field_error,
)
from app.dns.validators import DnsValueError, parse_value, validate_ttl
from app.models import DnsRecord, HealthCheck, HostedZone, Resource
from app.repositories import record_repo
from app.schemas.record import AliasOut, RecordIn, RecordOut
from app.services import zone_service
from app.services.record_validation import normalize_record


def to_out(record: DnsRecord, zone_id: str) -> RecordOut:
    alias = None
    if record.alias_target:
        alias = AliasOut(
            target=record.alias_target,
            target_type=record.alias_target_type or "",
            evaluate_target_health=record.evaluate_target_health,
            hosted_zone_id=record.alias_hosted_zone_id,
        )
    return RecordOut(
        id=record.id,
        zone_id=zone_id,
        name=record.name,
        type=record.type,
        ttl=record.ttl,
        values=list(record.values or []),
        parsed_values=[parse_value(record.type, x) for x in record.values or []],
        routing_policy=record.routing_policy,
        set_identifier=record.set_identifier,
        weight=record.weight,
        region=record.region,
        failover=record.failover,
        geo_continent=record.geo_continent,
        geo_country=record.geo_country,
        geo_subdivision=record.geo_subdivision,
        cidr_collection_id=record.cidr_collection_id,
        cidr_location=record.cidr_location,
        policy_record_id=record.policy_record_id,
        alias=alias,
        health_check_id=record.health_check.health_check_id if record.health_check else None,
        is_system=record.is_system,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def get_or_404(db: Session, record_id: int, owner_id: int) -> DnsRecord:
    record = record_repo.get(db, record_id)
    if record is None or record.zone.owner_id != owner_id:
        raise NotFoundError("Record not found.")
    return record


def _routing_key(rec) -> tuple:
    return (rec.get("failover") if isinstance(rec, dict) else rec.failover,
            rec.get("region") if isinstance(rec, dict) else rec.region,
            (rec.get("geo_continent"), rec.get("geo_country"), rec.get("geo_subdivision")) if isinstance(rec, dict)
            else (rec.geo_continent, rec.geo_country, rec.geo_subdivision))  # fmt: skip


def _check_conflicts(db: Session, zone: HostedZone, data: dict, exclude_id: int | None) -> None:
    others = record_repo.siblings(db, zone.id, data["name"], exclude_id)
    rtype, policy = data["type"], data["routing_policy"]

    other_types = {r.type for r in others}
    if rtype == "CNAME" and other_types - {"CNAME"}:
        raise ConflictError(
            f"A CNAME record cannot coexist with other record types at '{data['name']}' "
            f"(existing: {', '.join(sorted(other_types - {'CNAME'}))})."
        )
    if rtype != "CNAME" and "CNAME" in other_types:
        raise ConflictError(f"'{data['name']}' already has a CNAME record; no other record type can share its name.")

    same_type = [r for r in others if r.type == rtype]
    for existing in same_type:
        if existing.set_identifier == data["set_identifier"]:
            hint = "Edit the existing record instead." if policy == "simple" else "Record IDs must be unique."
            raise ConflictError(f"A {rtype} record named '{data['name']}' with this routing configuration already exists. {hint}")
        if existing.routing_policy != policy:
            raise ConflictError(
                f"Records with the same name and type must share one routing policy; "
                f"existing {rtype} record uses '{existing.routing_policy}'."
            )
        if policy == "failover" and existing.failover == data["failover"]:
            raise ConflictError(f"A {data['failover']} failover record already exists for this name and type.")
        if policy == "latency" and existing.region == data["region"]:
            raise ConflictError(f"A latency record for region {data['region']} already exists for this name and type.")
        if policy == "ipbased" and existing.cidr_collection_id == data["cidr_collection_id"] and existing.cidr_location == data["cidr_location"]:
            raise ConflictError("An IP-based record for this CIDR location already exists for this name and type.")
        if policy == "geolocation" and _routing_key(existing)[2] == _routing_key(data)[2]:
            raise ConflictError("A geolocation record for this location already exists for this name and type.")


def _resolve_health_check(db: Session, owner_id: int, public_id: str | None) -> int | None:
    if not public_id:
        return None
    health = db.scalar(select(HealthCheck).where(HealthCheck.health_check_id == public_id, HealthCheck.owner_id == owner_id))
    if health is None:
        raise ValidationFailure("Health check not found.", [field_error("health_check_id", "Health check not found.")])
    return health.id


def _check_alias_target(db: Session, zone: HostedZone, data: dict, exclude_id: int | None) -> None:
    if data.get("alias_target_type") != "record":
        return
    if data["alias_target"] == data["name"] and data["type"] in ("A", "AAAA"):
        raise ValidationFailure("An alias cannot point to itself.", [field_error("alias.target", "An alias cannot point to itself.")])
    if not record_repo.siblings(db, zone.id, data["alias_target"], exclude_id):
        msg = f"No record named '{data['alias_target']}' exists in this hosted zone."
        raise ValidationFailure(msg, [field_error("alias.target", msg)])


def _check_cidr(db: Session, owner_id: int, data: dict) -> None:
    if data["routing_policy"] != "ipbased":
        return
    collection = db.scalar(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == "cidr_collection", Resource.public_id == data["cidr_collection_id"]))
    if collection is None:
        msg = "CIDR collection not found."
        raise ValidationFailure(msg, [field_error("cidr_collection_id", msg)])
    names = {loc["name"] for loc in collection.data.get("locations", [])}
    if data["cidr_location"] != "*" and data["cidr_location"] not in names:
        msg = f"'{data['cidr_location']}' is not a location of the collection '{collection.name}'."
        raise ValidationFailure(msg, [field_error("cidr_location", msg)])


def _prepare(db: Session, zone: HostedZone, payload: RecordIn, exclude_id: int | None, *, allow_soa: bool = False) -> dict:
    data = normalize_record(zone.name, zone.zone_id, payload, allow_soa=allow_soa)
    data["health_check_id"] = _resolve_health_check(db, zone.owner_id, data["health_check_id"])
    _check_alias_target(db, zone, data, exclude_id)
    _check_cidr(db, zone.owner_id, data)
    _check_conflicts(db, zone, data, exclude_id)
    return data


def create_record(db: Session, zone: HostedZone, payload: RecordIn, *, commit: bool = True, managed_by: str | None = None) -> DnsRecord:
    data = _prepare(db, zone, payload, None)
    record = DnsRecord(hosted_zone_id=zone.id, policy_record_id=managed_by, **data)
    db.add(record)
    zone_service.refresh_record_count(db, zone)
    if commit:
        db.commit()
        db.refresh(record)
    return record


def update_record(db: Session, record: DnsRecord, payload: RecordIn) -> DnsRecord:
    _assert_not_managed(record)
    zone = record.zone
    data = _prepare(db, zone, payload, record.id, allow_soa=record.is_system)
    if record.is_system:
        immutable = (data["name"] != record.name or data["type"] != record.type
                     or data["routing_policy"] != "simple" or data["alias_target"] is not None)  # fmt: skip
        if immutable:
            raise ProtectedError("System NS and SOA records can only have their TTL and values changed.")
    for key, value in data.items():
        setattr(record, key, value)
    db.commit()
    db.refresh(record)
    return record


def _assert_not_managed(record: DnsRecord) -> None:
    if record.policy_record_id:
        raise ConflictError(f"This record is managed by the traffic policy record {record.policy_record_id}. Change or delete the policy record instead.")


def _assert_deletable(record: DnsRecord) -> None:
    _assert_not_managed(record)
    if record.is_system:
        raise ProtectedError(f"The default {record.type} record is managed by Route 53 and cannot be deleted.")


def delete_record(db: Session, record: DnsRecord) -> None:
    _assert_deletable(record)
    zone = record.zone
    db.delete(record)
    zone_service.refresh_record_count(db, zone)
    db.commit()


def bulk_delete(db: Session, zone: HostedZone, ids: list[int]) -> tuple[int, list[dict]]:
    """Delete many records; system records and foreign ids are skipped and reported."""
    deleted, skipped = 0, []
    records = {r.id: r for r in db.scalars(select(DnsRecord).where(DnsRecord.id.in_(ids), DnsRecord.hosted_zone_id == zone.id)).unique()}
    for record_id in ids:
        record = records.get(record_id)
        if record is None:
            skipped.append({"id": record_id, "reason": "Record not found in this hosted zone."})
        elif record.is_system:
            skipped.append({"id": record_id, "reason": f"Default {record.type} record cannot be deleted."})
        elif record.policy_record_id:
            skipped.append({"id": record_id, "reason": f"Managed by traffic policy record {record.policy_record_id}."})
        else:
            db.delete(record)
            deleted += 1
    zone_service.refresh_record_count(db, zone)
    db.commit()
    return deleted, skipped


def bulk_update_ttl(db: Session, zone: HostedZone, ids: list[int], ttl: int) -> tuple[int, list[dict]]:
    """Set the TTL on many records at once. Alias records have no TTL and are skipped and reported."""
    try:
        validate_ttl(ttl)
    except DnsValueError as exc:
        raise ValidationFailure(str(exc), [field_error("ttl", str(exc))]) from exc
    updated, skipped = 0, []
    records = {r.id: r for r in db.scalars(select(DnsRecord).where(DnsRecord.id.in_(ids), DnsRecord.hosted_zone_id == zone.id)).unique()}
    for record_id in ids:
        record = records.get(record_id)
        if record is None:
            skipped.append({"id": record_id, "reason": "Record not found in this hosted zone."})
        elif record.alias_target:
            skipped.append({"id": record_id, "reason": "Alias records do not have a TTL."})
        elif record.policy_record_id:
            skipped.append({"id": record_id, "reason": f"Managed by traffic policy record {record.policy_record_id}."})
        else:
            record.ttl = ttl
            updated += 1
    db.commit()
    return updated, skipped
