"""Registered domains and their request history."""
import re
from datetime import datetime

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ValidationFailure, field_error
from app.dns import validators as v
from app.models import HostedZone, Resource
from app.schemas.hosted_zone import HostedZoneCreate
from app.services import domain_service, zone_service
from app.services.resources.base import ResourceKind
from app.services.resources.registry import register

PHONE_RE = re.compile(r"^\+?[0-9][0-9 .()-]{6,19}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


class Contact(BaseModel):
    first_name: str = ""
    last_name: str = ""
    organization: str = ""
    email: str = ""
    phone: str = ""
    address_line: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""
    country: str = ""


class DomainPayload(BaseModel):
    name: str
    years: int = 1
    auto_renew: bool = True
    transfer_lock: bool = True
    privacy_protection: bool = True
    name_servers: list[str] = Field(default_factory=list)
    contact: Contact = Field(default_factory=Contact)


def _contact_errors(contact: dict) -> list[dict]:
    errors = []
    required = {"first_name": "First name", "last_name": "Last name", "address_line": "Address", "city": "City", "country": "Country"}
    for key, label in required.items():
        if not contact[key].strip():
            errors.append(field_error(f"contact.{key}", f"{label} is required."))
    if not EMAIL_RE.match(contact["email"].strip()):
        errors.append(field_error("contact.email", "Enter a valid email address."))
    if not PHONE_RE.match(contact["phone"].strip()):
        errors.append(field_error("contact.phone", "Enter a phone number such as +1 555 0100."))
    if contact["country"] and not re.fullmatch(r"[A-Za-z]{2}", contact["country"].strip()):
        errors.append(field_error("contact.country", "Use a two-letter country code."))
    return errors


def _validate(db: Session, owner_id: int, data: dict, existing: Resource | None) -> dict:
    errors: list[dict] = []
    if existing is not None:
        # Only renewal settings and name servers change after registration.
        locked = {k: existing.data[k] for k in ("years", "contact", "registered_at", "expires_at", "zone_id", "auth_code")}
        data["name"] = existing.name
    else:
        try:
            data["name"] = v.normalize_zone_name(data["name"])
        except v.DnsValueError as exc:
            raise ValidationFailure(str(exc), [field_error("name", str(exc))]) from exc
        domain_service.check_registrable(db, owner_id, data["name"])
        if not 1 <= data["years"] <= domain_service.MAX_YEARS:
            errors.append(field_error("years", f"Choose between 1 and {domain_service.MAX_YEARS} years."))
        errors += _contact_errors(data["contact"])
        locked = {}
    servers = []
    for i, ns in enumerate(data["name_servers"]):
        try:
            servers.append(v.normalize_hostname(ns, field="Name server"))
        except v.DnsValueError as exc:
            errors.append(field_error("name_servers", f"Name server {i + 1}: {exc}"))
    if servers and not 2 <= len(servers) <= 6:
        errors.append(field_error("name_servers", "Provide between 2 and 6 name servers."))
    data["name_servers"] = servers
    if errors:
        raise ValidationFailure(errors[0]["message"], errors)
    data.update(locked)
    return data


def _after_create(db: Session, owner_id: int, domain: Resource) -> None:
    data = dict(domain.data)
    now = datetime.utcnow()
    zone = db.scalar(select(HostedZone).where(HostedZone.name == domain.name, HostedZone.is_private.is_(False)))
    if zone is None:
        zone = zone_service.create_zone(db, HostedZoneCreate(name=domain.name, comment="Created by domain registration"), commit=False)
    data.update(
        registered_at=now.isoformat(timespec="seconds"), expires_at=domain_service.new_expiry(data["years"], now), zone_id=zone.zone_id, auth_code=None,
        name_servers=data["name_servers"] or zone_service.name_servers(zone.zone_id),
    )  # fmt: skip
    domain.data = data
    tld = domain.name.rsplit(".", 1)[-1]
    domain_service.add_request(db, owner_id, "REGISTER_DOMAIN", domain.name, f"Registered for {data['years']} year(s)", round((domain_service.price_for(tld) or 0) * data["years"], 2))


def _after_update(db: Session, owner_id: int, domain: Resource) -> None:
    domain_service.add_request(db, owner_id, "UPDATE_DOMAIN", domain.name, "Domain settings or name servers changed")


def _present(db: Session, resource: Resource, flat: dict) -> dict:
    expires = datetime.fromisoformat(flat["expires_at"])
    days = (expires - datetime.utcnow()).days
    zone = db.scalar(select(HostedZone).where(HostedZone.zone_id == flat.get("zone_id")))
    return {"days_to_expiry": days, "zone_name": zone.name if zone else None, "expiring_soon": 0 <= days <= 60}


domain = register(
    ResourceKind(
        kind="domain", label="Registered domain", id_prefix="dom", href="/registered-domains", payload=DomainPayload, default_status="ACTIVE",
        validate=_validate, after_create=_after_create, after_update=_after_update, present=_present, deletable=False, sort_keys=("expires_at",),
    )
)


class DomainRequestPayload(BaseModel):
    name: str = ""


domain_request = register(
    ResourceKind(
        kind="domain_request", label="Domain request", id_prefix="req", href="/domain-requests", payload=DomainRequestPayload,
        default_status="IN_PROGRESS", before_read=domain_service.settle_requests, deletable=False, filters=("request_type",), sort_keys=("request_type",),
    )
)
