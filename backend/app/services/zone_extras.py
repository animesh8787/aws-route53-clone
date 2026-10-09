"""Hosted zone tags and (simulated) DNSSEC signing."""
import base64
import hashlib
import re
from datetime import datetime

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, ValidationFailure, field_error
from app.models import HostedZone

MAX_TAGS = 50
TAG_RE = re.compile(r"^[\w\s.:/=+@-]*$")
KSK_RE = re.compile(r"^[A-Za-z0-9_]{3,128}$")
KMS_RE = re.compile(r"^alias/[A-Za-z0-9/_-]{1,256}$")
ALGORITHM = {"number": 13, "name": "ECDSAP256SHA256"}


class Tag(BaseModel):
    key: str
    value: str = ""


class TagsIn(BaseModel):
    tags: list[Tag] = Field(default_factory=list)


class DnssecEnable(BaseModel):
    ksk_name: str = "route53_ksk"
    kms_key_alias: str = "alias/route53-dnssec"


def set_tags(db: Session, zone: HostedZone, tags: list[Tag]) -> list[dict]:
    errors, seen, cleaned = [], set(), []
    if len(tags) > MAX_TAGS:
        errors.append(field_error("tags", f"A hosted zone can have at most {MAX_TAGS} tags."))
    for i, tag in enumerate(tags, start=1):
        key, value = tag.key.strip(), tag.value.strip()
        if not 1 <= len(key) <= 128:
            errors.append(field_error("tags", f"Tag {i}: the key must be 1-128 characters."))
        elif key.lower().startswith("aws:"):
            errors.append(field_error("tags", f"Tag {i}: keys starting with 'aws:' are reserved."))
        elif key in seen:
            errors.append(field_error("tags", f"Tag {i}: duplicate key '{key}'."))
        if len(value) > 256:
            errors.append(field_error("tags", f"Tag {i}: the value must be at most 256 characters."))
        if not TAG_RE.match(key) or not TAG_RE.match(value):
            errors.append(field_error("tags", f"Tag {i}: use letters, digits, spaces and + - = . _ : / @ only."))
        seen.add(key)
        cleaned.append({"key": key, "value": value})
    if errors:
        raise ValidationFailure(errors[0]["message"], errors)
    zone.tags = cleaned
    db.commit()
    return cleaned


def _key_material(zone: HostedZone, ksk_name: str) -> dict:
    seed = hashlib.sha256(f"{zone.zone_id}:{ksk_name}".encode()).digest()
    key_tag = int.from_bytes(seed[:2], "big")
    digest = hashlib.sha256(seed).hexdigest().upper()
    public_key = base64.b64encode(seed + hashlib.sha256(seed + b"pub").digest()).decode()
    return {
        "key_tag": key_tag, "algorithm": ALGORITHM, "digest_type": {"number": 2, "name": "SHA-256"}, "public_key": public_key,
        "ds_record": f"{key_tag} {ALGORITHM['number']} 2 {digest}", "digest": digest,
        "dnskey_record": f"257 3 {ALGORITHM['number']} {public_key}",
    }  # fmt: skip


def dnssec_status(zone: HostedZone) -> dict:
    state = zone.dnssec
    if not state:
        return {"status": "NOT_SIGNING", "ksk": None, "supported": not zone.is_private}
    return {"status": "SIGNING", "ksk": state, "supported": True}


def enable_dnssec(db: Session, zone: HostedZone, body: DnssecEnable) -> dict:
    if zone.is_private:
        raise ConflictError("DNSSEC signing is only available for public hosted zones.")
    if zone.dnssec:
        raise ConflictError("DNSSEC signing is already enabled for this hosted zone.")
    errors = []
    if not KSK_RE.match(body.ksk_name):
        errors.append(field_error("ksk_name", "Use 3-128 letters, digits or underscores."))
    if not KMS_RE.match(body.kms_key_alias):
        errors.append(field_error("kms_key_alias", "Use a KMS key alias such as alias/route53-dnssec."))
    if errors:
        raise ValidationFailure(errors[0]["message"], errors)
    zone.dnssec = {
        "name": body.ksk_name, "kms_key_alias": body.kms_key_alias, "status": "ACTIVE", "created_at": datetime.utcnow().isoformat(timespec="seconds"),
        **_key_material(zone, body.ksk_name),
    }  # fmt: skip
    db.commit()
    return dnssec_status(zone)


def disable_dnssec(db: Session, zone: HostedZone) -> dict:
    if not zone.dnssec:
        raise ConflictError("DNSSEC signing is not enabled for this hosted zone.")
    zone.dnssec = None
    db.commit()
    return dnssec_status(zone)
