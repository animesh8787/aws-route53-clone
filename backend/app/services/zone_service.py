"""Hosted zone business logic, including deterministic SOA / NS system records."""
import hashlib
import secrets
import string

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, ValidationFailure, field_error
from app.dns import validators as v
from app.models import DnsRecord, HostedZone, VpcAssociation
from app.repositories import zone_repo
from app.schemas.hosted_zone import HostedZoneCreate, HostedZoneOut, VpcOut

NS_TTL = 172800
SOA_TTL = 900
_TLDS = ("com", "net", "org", "co.uk")
_ID_ALPHABET = string.ascii_uppercase + string.digits


def generate_zone_id() -> str:
    return "Z" + "".join(secrets.choice(_ID_ALPHABET) for _ in range(19))


def name_servers(zone_id: str) -> list[str]:
    """Four stable, AWS-looking name servers derived from the zone id."""
    digest = hashlib.sha256(zone_id.encode()).digest()
    servers = []
    for index, tld in enumerate(_TLDS):
        n = int.from_bytes(digest[index * 2 : index * 2 + 2], "big") % 2048
        d = digest[8 + index] % 64
        servers.append(f"ns-{n}.awsdns-{d:02d}.{tld}.")
    return servers


def soa_value(zone_id: str) -> str:
    return f"{name_servers(zone_id)[0]} awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400"


def to_out(zone: HostedZone) -> HostedZoneOut:
    return HostedZoneOut(
        id=zone.id,
        zone_id=zone.zone_id,
        name=zone.name,
        type="private" if zone.is_private else "public",
        comment=zone.comment,
        record_count=zone.record_count,
        created_by=zone.created_by,
        created_at=zone.created_at,
        updated_at=zone.updated_at,
        name_servers=name_servers(zone.zone_id),
        vpcs=[VpcOut(vpc_id=x.vpc_id, region=x.region) for x in zone.vpcs],
    )


def get_or_404(db: Session, ref: str) -> HostedZone:
    zone = zone_repo.get_by_ref(db, ref)
    if zone is None:
        raise NotFoundError("Hosted zone not found.")
    return zone


def refresh_record_count(db: Session, zone: HostedZone) -> None:
    db.flush()
    zone.record_count = db.scalar(select(func.count()).where(DnsRecord.hosted_zone_id == zone.id)) or 0


def create_zone(db: Session, payload: HostedZoneCreate, *, created_by: str = "Route 53", zone_id: str | None = None, commit: bool = True) -> HostedZone:
    errors = []
    name = None
    try:
        name = v.normalize_zone_name(payload.name)
    except v.DnsValueError as exc:
        errors.append(field_error("name", str(exc)))
    is_private = payload.type == "private"
    if is_private and payload.vpc is None:
        errors.append(field_error("vpc", "A private hosted zone must be associated with a VPC."))
    if errors:
        raise ValidationFailure(errors[0]["message"], errors)
    if zone_repo.find_duplicate(db, name, is_private):
        kind = "private" if is_private else "public"
        raise ConflictError(f"A {kind} hosted zone for '{name}' already exists.")

    zone = HostedZone(
        zone_id=zone_id or generate_zone_id(),
        name=name,
        is_private=is_private,
        comment=payload.comment.strip(),
        created_by=created_by,
    )
    if is_private and payload.vpc:
        zone.vpcs.append(VpcAssociation(vpc_id=payload.vpc.vpc_id, region=payload.vpc.region))
    db.add(zone)
    db.flush()
    fqdn = f"{name}."
    db.add_all(
        [
            DnsRecord(hosted_zone_id=zone.id, name=fqdn, type="NS", ttl=NS_TTL, values=name_servers(zone.zone_id), is_system=True),
            DnsRecord(hosted_zone_id=zone.id, name=fqdn, type="SOA", ttl=SOA_TTL, values=[soa_value(zone.zone_id)], is_system=True),
        ]
    )
    refresh_record_count(db, zone)
    if commit:
        db.commit()
        db.refresh(zone)
    return zone


def update_comment(db: Session, zone: HostedZone, comment: str) -> HostedZone:
    zone.comment = comment.strip()
    db.commit()
    db.refresh(zone)
    return zone


def delete_zone(db: Session, zone: HostedZone, *, force: bool = False) -> None:
    """Mirror Route 53: refuse while non-system records exist, unless ``force``."""
    if not force:
        user_records = db.scalar(
            select(func.count()).where(DnsRecord.hosted_zone_id == zone.id, DnsRecord.is_system.is_(False))
        )
        if user_records:
            raise ConflictError(
                f"The hosted zone contains {user_records} record(s) other than the default NS and SOA records. "
                "Delete those records first, or delete the zone together with its records."
            )
    db.delete(zone)
    db.commit()
