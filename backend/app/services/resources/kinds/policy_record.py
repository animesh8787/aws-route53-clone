"""Policy records: attach a traffic policy version to a DNS name; the policy is materialised into real records."""
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ValidationFailure, field_error
from app.dns import validators as v
from app.models import DnsRecord, HealthCheck, HostedZone, Resource
from app.schemas.record import AliasIn, RecordIn
from app.services import record_service, zone_service
from app.services.resources.base import ResourceKind
from app.services.resources.kinds.traffic_policy import record_plan
from app.services.resources.registry import register


class PolicyRecordPayload(BaseModel):
    name: str = ""  # derived from the DNS name; accepted so the generic form can send it
    zone_id: str
    dns_name: str = ""
    policy_id: str
    policy_version: int = Field(ge=1)
    ttl: int = 60


def _find_policy(db: Session, owner_id: int, policy_id: str) -> Resource:
    policy = db.scalar(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == "traffic_policy", Resource.public_id == policy_id))
    if policy is None:
        msg = "Traffic policy not found."
        raise ValidationFailure(msg, [field_error("policy_id", msg)])
    return policy


def _validate(db: Session, owner_id: int, data: dict, existing: Resource | None) -> dict:
    errors = []
    zone = db.scalar(select(HostedZone).where(HostedZone.zone_id == data["zone_id"]))
    if zone is None:
        raise ValidationFailure("Hosted zone not found.", [field_error("zone_id", "Hosted zone not found.")])
    try:
        fqdn = v.to_fqdn(data["dns_name"], zone.name)
    except v.DnsValueError as exc:
        raise ValidationFailure(str(exc), [field_error("dns_name", str(exc))]) from exc
    if existing is not None and (existing.data["zone_id"] != data["zone_id"] or existing.data["dns_name"] != fqdn):
        errors.append(field_error("dns_name", "The hosted zone and DNS name of a policy record cannot be changed."))
    try:
        v.validate_ttl(data["ttl"])
    except v.DnsValueError as exc:
        errors.append(field_error("ttl", str(exc)))
    policy = _find_policy(db, owner_id, data["policy_id"])
    versions = {ver["version"] for ver in policy.data["versions"]}
    if data["policy_version"] not in versions:
        errors.append(field_error("policy_version", f"Version {data['policy_version']} does not exist (latest is {max(versions)})."))
    if errors:
        raise ValidationFailure(errors[0]["message"], errors)
    data["dns_name"] = fqdn
    data["name"] = fqdn.rstrip(".")
    data["zone_name"] = zone.name
    data["record_type"] = policy.data["record_type"]
    data["policy_name"] = policy.name
    return data


def _records(db: Session, policy_record: Resource) -> list[DnsRecord]:
    return list(db.scalars(select(DnsRecord).where(DnsRecord.policy_record_id == policy_record.public_id)).unique())


def _health_pk(db: Session, owner_id: int, public_id: str | None) -> str | None:
    if not public_id:
        return None
    exists = db.scalar(select(func.count()).where(HealthCheck.owner_id == owner_id, HealthCheck.health_check_id == public_id))
    if not exists:
        msg = f"Health check '{public_id}' referenced by the policy was not found."
        raise ValidationFailure(msg, [field_error("policy_id", msg)])
    return public_id


def _materialise(db: Session, owner_id: int, policy_record: Resource) -> None:
    data = policy_record.data
    zone = db.scalar(select(HostedZone).where(HostedZone.zone_id == data["zone_id"]))
    policy = _find_policy(db, owner_id, data["policy_id"])
    document = next(ver["document"] for ver in policy.data["versions"] if ver["version"] == data["policy_version"])
    for entry in record_plan(document, data["record_type"]):
        alias = AliasIn(**entry["alias"]) if entry.get("alias") else None
        payload = RecordIn(
            name=data["dns_name"], type=data["record_type"], ttl=None if alias else data["ttl"], values=entry.get("values", []), alias=alias,
            routing_policy=entry["routing_policy"], set_identifier=(f"tp-{policy_record.public_id[-6:]}-{entry['set_identifier']}" if entry.get("set_identifier") else None),
            weight=entry.get("weight"), region=entry.get("region"), failover=entry.get("failover"), geo_continent=entry.get("geo_continent"),
            geo_country=entry.get("geo_country"), health_check_id=_health_pk(db, owner_id, entry.get("health_check_id")),
        )  # fmt: skip
        record_service.create_record(db, zone, payload, commit=False, managed_by=policy_record.public_id)
    data["record_total"] = len(_records(db, policy_record))


def _drop_records(db: Session, policy_record: Resource) -> None:
    zone = db.scalar(select(HostedZone).where(HostedZone.zone_id == policy_record.data["zone_id"]))
    for record in _records(db, policy_record):
        db.delete(record)
    if zone is not None:
        zone_service.refresh_record_count(db, zone)


def _after_update(db: Session, owner_id: int, policy_record: Resource) -> None:
    _drop_records(db, policy_record)
    db.flush()
    _materialise(db, owner_id, policy_record)


def _present(db: Session, resource: Resource, flat: dict) -> dict:
    return {"record_count": len(_records(db, resource))}


policy_record = register(
    ResourceKind(
        kind="policy_record", label="Policy record", id_prefix="tpr", href="/policy-records", payload=PolicyRecordPayload, default_status="APPLIED",
        validate=_validate, after_create=lambda db, owner, r: _materialise(db, owner, r), after_update=_after_update,
        after_delete=lambda db, owner, r: _drop_records(db, r), present=_present,
    )
)
