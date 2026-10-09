"""Simulated domain registration: availability search, pricing, renewals, transfers and request history.

Nothing is purchased or registered anywhere. Availability is a deterministic function of the name so the
experience is repeatable; registering a domain also creates (or reuses) its public hosted zone, like Route 53.
"""
import hashlib
import re
import secrets
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, ValidationFailure, field_error
from app.core.ids import new_id
from app.dns import validators as v
from app.models import Resource

TLD_PRICES = {"com": 14.0, "net": 11.0, "org": 12.0, "io": 39.0, "dev": 12.0, "app": 14.0, "co": 28.0, "info": 18.0, "xyz": 12.0, "me": 17.0}
SUGGESTED_TLDS = ("com", "net", "org", "io", "dev", "app")
RESERVED_LABELS = {"example", "google", "amazon", "aws", "facebook", "microsoft", "apple", "github", "route53", "localhost", "test", "iana"}
REQUEST_SETTLE_SECONDS = 15
MAX_YEARS = 10


def price_for(tld: str) -> float | None:
    return TLD_PRICES.get(tld.lower())


def _split(name: str) -> tuple[str, str]:
    normalised = v.normalize_zone_name(name)
    label, _, tld = normalised.rpartition(".")
    return label, tld


def _taken(name: str) -> bool:
    label = name.rsplit(".", 1)[0].split(".")[-1]
    if label in RESERVED_LABELS:
        return True
    return hashlib.sha256(name.encode()).digest()[0] % 5 == 0  # deterministic: about one in five names is taken


def availability(db: Session, owner_id: int, query: str) -> list[dict]:
    """Result list for a search: the exact name first, then the same label under popular TLDs."""
    text = query.strip().lower().rstrip(".")
    if not text:
        raise ValidationFailure("Enter a domain name to search.", [field_error("name", "Enter a domain name to search.")])
    base_label = text.split(".")[0]
    if not re.fullmatch(r"[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?", base_label):
        msg = "Use letters, digits and hyphens only; the name cannot start or end with a hyphen."
        raise ValidationFailure(msg, [field_error("name", msg)])
    candidates = [text if "." in text else f"{text}.com"] + [f"{base_label}.{tld}" for tld in SUGGESTED_TLDS]
    mine = {r.name for r in db.scalars(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == "domain"))}
    results, seen = [], set()
    for name in candidates:
        if name in seen:
            continue
        seen.add(name)
        try:
            _, tld = _split(name)
        except v.DnsValueError as exc:
            results.append({"name": name, "available": False, "price": None, "reason": str(exc)})
            continue
        price = price_for(tld)
        if price is None:
            results.append({"name": name, "available": False, "price": None, "reason": f".{tld} is not supported by this registrar."})
        elif name in mine:
            results.append({"name": name, "available": False, "price": price, "reason": "Already registered in your account."})
        elif _taken(name):
            results.append({"name": name, "available": False, "price": price, "reason": "Already registered by someone else."})
        else:
            results.append({"name": name, "available": True, "price": price, "reason": None})
    return results


def check_registrable(db: Session, owner_id: int, name: str) -> float:
    """Return the yearly price, or raise a validation error explaining why the name cannot be registered."""
    entry = availability(db, owner_id, name)[0]
    if not entry["available"]:
        raise ValidationFailure(f"{entry['name']} is not available: {entry['reason']}", [field_error("name", entry["reason"] or "Not available.")])
    return float(entry["price"])


def add_request(db: Session, owner_id: int, request_type: str, domain_name: str, detail: str = "", price: float | None = None) -> Resource:
    now = datetime.utcnow().isoformat(timespec="seconds")
    public_id = new_id("req")
    request = Resource(
        owner_id=owner_id, kind="domain_request", public_id=public_id, name=f"{request_type.lower()}-{domain_name}-{public_id[-6:]}", status="IN_PROGRESS",
        data={"request_type": request_type, "domain_name": domain_name, "detail": detail, "price": price, "submitted_at": now},
    )  # fmt: skip
    db.add(request)
    return request


def settle_requests(db: Session, owner_id: int) -> None:
    """Requests complete a few seconds after submission (no background worker needed)."""
    cutoff = (datetime.utcnow() - timedelta(seconds=REQUEST_SETTLE_SECONDS)).isoformat(timespec="seconds")
    pending = db.scalars(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == "domain_request", Resource.status == "IN_PROGRESS"))
    changed = False
    for request in pending:
        if request.data.get("submitted_at", "") <= cutoff:
            request.status = "SUCCESSFUL"
            changed = True
    if changed:
        db.commit()


def new_expiry(years: int, start: datetime | None = None) -> str:
    base = start or datetime.utcnow()
    try:
        return base.replace(year=base.year + years).isoformat(timespec="seconds")
    except ValueError:  # 29 February
        return base.replace(year=base.year + years, day=28).isoformat(timespec="seconds")


def renew(db: Session, owner_id: int, domain: Resource, years: int) -> Resource:
    current = datetime.fromisoformat(domain.data["expires_at"])
    if not 1 <= years <= MAX_YEARS:
        raise ValidationFailure(f"Choose between 1 and {MAX_YEARS} years.", [field_error("years", f"Choose between 1 and {MAX_YEARS} years.")])
    if (current.year + years) - datetime.utcnow().year > MAX_YEARS:
        raise ConflictError(f"A domain can be registered for at most {MAX_YEARS} years in total.")
    tld = domain.name.rsplit(".", 1)[-1]
    data = dict(domain.data)
    data["expires_at"] = new_expiry(years, max(current, datetime.utcnow()))
    domain.data = data
    domain.status = "ACTIVE"
    add_request(db, owner_id, "RENEW_DOMAIN", domain.name, f"Renewed for {years} year(s)", round((price_for(tld) or 0) * years, 2))
    db.commit()
    db.refresh(domain)
    return domain


def transfer_out(db: Session, owner_id: int, domain: Resource) -> str:
    if domain.data.get("transfer_lock"):
        raise ConflictError("Turn off the transfer lock before requesting an authorization code.")
    code = secrets.token_urlsafe(12)
    data = dict(domain.data)
    data["auth_code"] = code
    domain.data = data
    add_request(db, owner_id, "TRANSFER_OUT", domain.name, "Authorization code generated")
    db.commit()
    return code
