"""Pure DNS validation / canonicalisation helpers (no DB, no HTTP).

Every public function either returns a canonical value or raises ``DnsValueError``
with a user-facing message. The frontend mirrors these rules in ``lib/dns-validation.ts``.
"""
import ipaddress
import re

from app.dns.constants import (
    MAX_LABEL_LENGTH,
    MAX_NAME_LENGTH,
    MAX_TTL,
    MAX_TXT_STRING,
    MAX_TXT_TOTAL,
)


class DnsValueError(ValueError):
    """A DNS value or name failed validation."""


_LABEL_RE = re.compile(r"^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?$")
CAA_TAGS = ("issue", "issuewild", "iodef")


# ----------------------------------------------------------------- names
def _check_labels(labels: list[str], *, allow_wildcard: bool, what: str) -> None:
    for index, label in enumerate(labels):
        if not label:
            raise DnsValueError(f"{what} contains an empty label (consecutive dots).")
        if len(label) > MAX_LABEL_LENGTH:
            raise DnsValueError(f"Label '{label[:20]}...' is longer than {MAX_LABEL_LENGTH} characters.")
        if label == "*":
            if not allow_wildcard or index != 0:
                raise DnsValueError("A wildcard (*) is only allowed as the entire leftmost label.")
            continue
        if not _LABEL_RE.match(label):
            raise DnsValueError(
                f"Label '{label}' is invalid. Use letters, digits, hyphens or underscores; "
                "labels cannot start or end with a hyphen."
            )


def normalize_zone_name(raw: str) -> str:
    """Lower-case, strip trailing dot, validate. Returns e.g. ``example.com``."""
    name = (raw or "").strip().lower().rstrip(".")
    if not name:
        raise DnsValueError("Domain name is required.")
    if len(name) > MAX_NAME_LENGTH:
        raise DnsValueError(f"Domain name cannot exceed {MAX_NAME_LENGTH} characters.")
    labels = name.split(".")
    if len(labels) < 2:
        raise DnsValueError("Domain name must contain at least two labels, for example example.com.")
    _check_labels(labels, allow_wildcard=False, what="Domain name")
    if labels[-1].isdigit():
        raise DnsValueError("The top-level label of a domain name cannot be numeric.")
    return name


def to_fqdn(raw: str, zone_name: str) -> str:
    """Resolve a record name to an absolute, lower-case name that ends with a dot.

    Accepts ``@``/empty (apex), relative names (``www``), names that already include the
    zone (``www.example.com``) and absolute names (``www.example.com.``).
    """
    value = (raw or "").strip().lower()
    zone = zone_name.rstrip(".").lower()
    if value in ("", "@"):
        return f"{zone}."
    absolute = value.endswith(".")
    base = value.rstrip(".")
    if absolute or base == zone or base.endswith("." + zone):
        fqdn = base
    else:
        fqdn = f"{base}.{zone}"
    if len(fqdn) > MAX_NAME_LENGTH:
        raise DnsValueError(f"Record name cannot exceed {MAX_NAME_LENGTH} characters.")
    _check_labels(fqdn.split("."), allow_wildcard=True, what="Record name")
    if fqdn != zone and not fqdn.endswith("." + zone):
        raise DnsValueError(f"Record name must end with the hosted zone name '{zone}'.")
    return fqdn + "."


def normalize_hostname(raw: str, *, field: str = "Value") -> str:
    """Canonicalise a DNS target (CNAME/NS/PTR/MX/SRV target). Always absolute with trailing dot."""
    value = (raw or "").strip().lower()
    if not value:
        raise DnsValueError(f"{field} must not be empty.")
    if value == ".":
        return "."
    value = value.rstrip(".")
    if len(value) > MAX_NAME_LENGTH:
        raise DnsValueError(f"{field} cannot exceed {MAX_NAME_LENGTH} characters.")
    _check_labels(value.split("."), allow_wildcard=False, what=field)
    return value + "."


# ----------------------------------------------------------------- scalars
def parse_int(raw: str, name: str, low: int, high: int) -> int:
    text = str(raw).strip()
    if not re.fullmatch(r"\d+", text):
        raise DnsValueError(f"{name} must be a whole number between {low} and {high}.")
    number = int(text)
    if not low <= number <= high:
        raise DnsValueError(f"{name} must be between {low} and {high}.")
    return number


def validate_ttl(ttl: int | None) -> int:
    if ttl is None:
        raise DnsValueError("TTL is required.")
    if not 0 <= ttl <= MAX_TTL:
        raise DnsValueError(f"TTL must be between 0 and {MAX_TTL} seconds.")
    return ttl


def validate_ipv4(raw: str) -> str:
    try:
        return str(ipaddress.IPv4Address(raw.strip()))
    except ValueError as exc:
        raise DnsValueError(f"'{raw.strip()}' is not a valid IPv4 address (example: 192.0.2.44).") from exc


def validate_ipv6(raw: str) -> str:
    try:
        return str(ipaddress.IPv6Address(raw.strip()))
    except ValueError as exc:
        raise DnsValueError(f"'{raw.strip()}' is not a valid IPv6 address (example: 2001:db8::1).") from exc


# ----------------------------------------------------------------- TXT
def _escape_txt(chunk: str) -> str:
    return '"' + chunk.replace("\\", "\\\\").replace('"', '\\"') + '"'


def split_txt_strings(raw: str) -> list[str]:
    """Return the individual character-strings of a TXT value.

    A value starting with ``"`` is parsed as one or more quoted strings (``"a" "b"``).
    Anything else is treated as a single raw string and split into 255-char chunks.
    """
    text = raw.strip()
    if not text:
        raise DnsValueError("TXT value must not be empty.")
    if not text.startswith('"'):
        return [text[i : i + MAX_TXT_STRING] for i in range(0, len(text), MAX_TXT_STRING)]
    strings: list[str] = []
    i, n = 0, len(text)
    while i < n:
        if text[i].isspace():
            i += 1
            continue
        if text[i] != '"':
            raise DnsValueError('Each TXT string must be enclosed in double quotes, e.g. "v=spf1 -all" "second string".')
        i += 1
        buf: list[str] = []
        while i < n and text[i] != '"':
            if text[i] == "\\" and i + 1 < n:
                i += 1
            buf.append(text[i])
            i += 1
        if i >= n:
            raise DnsValueError("TXT value has an unterminated double quote.")
        i += 1
        strings.append("".join(buf))
    if any(len(s) > MAX_TXT_STRING for s in strings):
        raise DnsValueError(f"Each quoted TXT string can contain at most {MAX_TXT_STRING} characters; split longer text into several quoted strings.")
    return strings


def canonical_txt(raw: str) -> str:
    strings = split_txt_strings(raw)
    if sum(len(s) for s in strings) > MAX_TXT_TOTAL:
        raise DnsValueError(f"TXT value is too long (max {MAX_TXT_TOTAL} characters in total).")
    return " ".join(_escape_txt(s) for s in strings)


# ----------------------------------------------------------------- per-type values
def _fields(raw: str, count: int, example: str) -> list[str]:
    parts = raw.split()
    if len(parts) != count:
        raise DnsValueError(f"Expected {count} space-separated fields, for example: {example}")
    return parts


def canonical_value(rtype: str, raw: str) -> str:
    """Validate one record value of ``rtype`` and return its canonical presentation form."""
    raw = (raw or "").strip()
    if not raw:
        raise DnsValueError("Value must not be empty.")
    if rtype == "A":
        return validate_ipv4(raw)
    if rtype == "AAAA":
        return validate_ipv6(raw)
    if rtype in ("CNAME", "NS", "PTR"):
        return normalize_hostname(raw, field=f"{rtype} target")
    if rtype == "TXT":
        return canonical_txt(raw)
    if rtype == "MX":
        prio, host = _fields(raw, 2, "10 mail.example.com")
        return f"{parse_int(prio, 'MX priority', 0, 65535)} {normalize_hostname(host, field='Mail server')}"
    if rtype == "SRV":
        prio, weight, port, target = _fields(raw, 4, "10 5 5060 sip.example.com")
        return " ".join(
            [
                str(parse_int(prio, "SRV priority", 0, 65535)),
                str(parse_int(weight, "SRV weight", 0, 65535)),
                str(parse_int(port, "SRV port", 0, 65535)),
                normalize_hostname(target, field="SRV target"),
            ]
        )
    if rtype == "CAA":
        match = re.fullmatch(r"(\S+)\s+(\S+)\s+(.+)", raw)
        if not match:
            raise DnsValueError('Expected "<flags> <tag> <value>", for example: 0 issue "letsencrypt.org"')
        flags = parse_int(match.group(1), "CAA flags", 0, 255)
        tag = match.group(2).lower()
        if tag not in CAA_TAGS:
            raise DnsValueError(f"CAA tag must be one of: {', '.join(CAA_TAGS)}.")
        value = match.group(3).strip()
        if value.startswith('"') and value.endswith('"') and len(value) >= 2:
            value = value[1:-1]
        if '"' in value:
            raise DnsValueError("CAA value cannot contain double quotes.")
        if not value:
            raise DnsValueError("CAA value must not be empty.")
        return f'{flags} {tag} "{value}"'
    if rtype == "SOA":
        parts = _fields(raw, 7, "ns-1.awsdns-01.com. hostmaster.example.com. 1 7200 900 1209600 86400")
        return " ".join([normalize_hostname(parts[0]), normalize_hostname(parts[1]), *parts[2:]])
    raise DnsValueError(f"Record type '{rtype}' is not supported.")


def parse_value(rtype: str, canonical: str) -> dict:
    """Break a canonical value into structured fields (used by the UI editor and the API)."""
    if rtype in ("A", "AAAA"):
        return {"address": canonical}
    if rtype in ("CNAME", "NS", "PTR"):
        return {"target": canonical}
    if rtype == "TXT":
        return {"strings": split_txt_strings(canonical)}
    if rtype == "MX":
        prio, host = canonical.split()
        return {"priority": int(prio), "exchange": host}
    if rtype == "SRV":
        prio, weight, port, target = canonical.split()
        return {"priority": int(prio), "weight": int(weight), "port": int(port), "target": target}
    if rtype == "CAA":
        flags, tag, rest = canonical.split(" ", 2)
        return {"flags": int(flags), "tag": tag, "value": rest.strip('"')}
    if rtype == "SOA":
        parts = canonical.split()
        keys = ("mname", "rname", "serial", "refresh", "retry", "expire", "minimum")
        return dict(zip(keys, parts, strict=False))
    return {"raw": canonical}
