"""BIND zone-file parsing and serialisation.

Supported: ``$ORIGIN``, ``$TTL`` (with s/m/h/d/w units), ``@``, relative and absolute
names, blank owner (repeat previous), optional TTL/class (``IN``), multi-line values in
parentheses, ``;`` comments, quoted TXT strings, and record types A, AAAA, CNAME, TXT,
MX, NS, PTR, SRV, CAA. SOA and the zone's default apex NS are skipped (Route 53 owns them).
Not supported: ``$INCLUDE``, ``$GENERATE``, classes other than IN, DNSSEC record types.
"""
import re
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.dns.constants import DEFAULT_TTL, USER_RECORD_TYPES
from app.models import DnsRecord, HostedZone
from app.repositories import record_repo
from app.schemas.importexport import ImportItem, ImportResult
from app.schemas.record import RecordIn
from app.services import record_service

MAX_IMPORT_BYTES = 1_000_000
_TOKEN_RE = re.compile(r'"(?:[^"\\]|\\.)*"|[^\s"]+')
_TTL_RE = re.compile(r"^(\d+)([smhdw]?)$", re.IGNORECASE)
_UNITS = {"": 1, "s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800}
_CLASSES = {"IN", "CH", "HS", "CS"}


class BindSyntaxError(Exception):
    pass


def parse_ttl(token: str) -> int | None:
    match = _TTL_RE.match(token)
    return int(match.group(1)) * _UNITS[match.group(2).lower()] if match else None


def _strip_comment(line: str) -> str:
    in_quote = escaped = False
    for index, ch in enumerate(line):
        if escaped:
            escaped = False
        elif ch == "\\":
            escaped = True
        elif ch == '"':
            in_quote = not in_quote
        elif ch == ";" and not in_quote:
            return line[:index]
    return line


def _paren_delta(line: str) -> int:
    depth, in_quote = 0, False
    for ch in line:
        if ch == '"':
            in_quote = not in_quote
        elif not in_quote and ch == "(":
            depth += 1
        elif not in_quote and ch == ")":
            depth -= 1
    return depth


def _logical_lines(text: str) -> list[tuple[int, str]]:
    """Join parenthesised continuations; returns ``(first_line_number, text)``."""
    result: list[tuple[int, str]] = []
    buffer, start, depth = "", 0, 0
    for number, raw in enumerate(text.splitlines(), start=1):
        line = _strip_comment(raw).rstrip()
        if depth == 0:
            if not line.strip():
                continue
            buffer, start = line, number
        else:
            buffer += " " + line.strip()
        depth += _paren_delta(line)
        if depth <= 0:
            depth = 0
            result.append((start, buffer.replace("(", " ").replace(")", " ")))
    if depth:
        raise BindSyntaxError(f"Unclosed parenthesis starting on line {start}.")
    return result


def _qualify(host: str, origin: str) -> str:
    if host == "@":
        return origin
    return host if host.endswith(".") else f"{host}.{origin}"


@dataclass
class ParsedGroup:
    line: int
    name: str
    type: str
    ttl: int
    values: list[str] = field(default_factory=list)
    error: str | None = None
    skip: str | None = None


def parse_zone_file(text: str, zone_name: str) -> list[ParsedGroup]:
    origin = zone_name.rstrip(".") + "."
    default_ttl = DEFAULT_TTL
    last_owner = origin
    groups: dict[tuple[str, str], ParsedGroup] = {}
    order: list[ParsedGroup] = []

    def failed(line: int, message: str) -> None:
        order.append(ParsedGroup(line=line, name="?", type="?", ttl=0, error=message))

    for number, line in _logical_lines(text):
        tokens = _TOKEN_RE.findall(line)
        if not tokens:
            continue
        head = tokens[0].upper()
        if head == "$ORIGIN" and len(tokens) == 2:
            origin = tokens[1] if tokens[1].endswith(".") else f"{tokens[1]}.{origin}"
            continue
        if head == "$TTL" and len(tokens) == 2:
            parsed = parse_ttl(tokens[1])
            if parsed is None:
                failed(number, f"Invalid $TTL value '{tokens[1]}'.")
            else:
                default_ttl = parsed
            continue
        if head.startswith("$"):
            failed(number, f"Unsupported directive {tokens[0]}.")
            continue

        if line[0] not in " \t":
            owner = _qualify(tokens[0], origin).lower()
            last_owner = owner
            rest = tokens[1:]
        else:
            owner, rest = last_owner, tokens
        ttl, index = default_ttl, 0
        while index < len(rest):
            token = rest[index]
            if token.upper() in _CLASSES:
                if token.upper() != "IN":
                    break
                index += 1
            elif parse_ttl(token) is not None and not (index + 1 >= len(rest)):
                ttl = parse_ttl(token) or 0
                index += 1
            else:
                break
        if index >= len(rest):
            failed(number, "Missing record type.")
            continue
        rtype, rdata = rest[index].upper(), rest[index + 1 :]
        if not rdata:
            failed(number, f"{rtype} record has no data.")
            continue

        if rtype == "SOA":
            order.append(ParsedGroup(line=number, name=owner, type="SOA", ttl=ttl, values=[" ".join(rdata)], skip="SOA is managed by Route 53."))
            continue
        if rtype not in USER_RECORD_TYPES:
            failed(number, f"Unsupported record type '{rtype}'.")
            continue

        if rtype in ("CNAME", "NS", "PTR"):
            rdata = [_qualify(rdata[0], origin), *rdata[1:]]
        elif rtype == "MX" and len(rdata) >= 2:
            rdata = [rdata[0], _qualify(rdata[1], origin), *rdata[2:]]
        elif rtype == "SRV" and len(rdata) >= 4:
            rdata = [*rdata[:3], _qualify(rdata[3], origin), *rdata[4:]]
        value = " ".join(rdata)

        key = (owner, rtype)
        if key in groups:
            groups[key].values.append(value)
        else:
            groups[key] = ParsedGroup(line=number, name=owner, type=rtype, ttl=ttl, values=[value])
            order.append(groups[key])
    return order


def import_zone_file(db: Session, zone: HostedZone, content: str, *, dry_run: bool, skip_invalid: bool) -> ImportResult:
    """Parse ``content`` and create the records inside one transaction.

    ``dry_run`` rolls the transaction back so the response doubles as a preview.
    Without ``skip_invalid`` any error aborts the whole import (all-or-nothing).
    """
    if len(content.encode()) > MAX_IMPORT_BYTES:
        raise AppError("Zone file is too large (limit 1 MB).")
    try:
        groups = parse_zone_file(content, zone.name)
    except BindSyntaxError as exc:
        raise AppError(str(exc)) from exc

    items: list[ImportItem] = []
    for group in groups:
        item = ImportItem(line=group.line, name=group.name, type=group.type, ttl=group.ttl, values=group.values, status="ok")
        if group.error:
            item.status, item.message = "error", group.error
        elif group.skip:
            item.status, item.message = "skipped", group.skip
        elif group.type == "NS" and group.name == f"{zone.name}.":
            item.status, item.message = "skipped", "Apex NS records are managed by Route 53."
        else:
            try:
                record_service.create_record(db, zone, RecordIn(name=group.name, type=group.type, ttl=group.ttl, values=group.values), commit=False)
            except AppError as exc:
                item.status, item.message = "error", exc.detail
        items.append(item)

    created = sum(1 for i in items if i.status == "ok")
    errors = sum(1 for i in items if i.status == "error")
    skipped = sum(1 for i in items if i.status == "skipped")
    committed = False
    if dry_run or (errors and not skip_invalid):
        db.rollback()
    else:
        db.commit()
        committed = True
    return ImportResult(dry_run=dry_run, committed=committed, created=created if committed else 0, valid=created, errors=errors, skipped=skipped, items=items)


# ----------------------------------------------------------------- export
def _relative(name: str, zone_name: str) -> str:
    origin = zone_name + "."
    return "@" if name == origin else name.removesuffix("." + origin) if name.endswith("." + origin) else name


def export_bind(zone: HostedZone, records: list[DnsRecord]) -> str:
    lines = [
        f"; Zone file for {zone.name} exported from the Route 53 clone",
        f"; Hosted zone ID: {zone.zone_id} ({'private' if zone.is_private else 'public'})",
        f"$ORIGIN {zone.name}.",
        f"$TTL {DEFAULT_TTL}",
        "",
    ]
    for record in records:
        owner = _relative(record.name, zone.name)
        note = ""
        if record.routing_policy != "simple":
            details = {"id": record.set_identifier, "weight": record.weight, "region": record.region, "failover": record.failover,
                       "continent": record.geo_continent, "country": record.geo_country, "subdivision": record.geo_subdivision}  # fmt: skip
            note = "; routing=" + record.routing_policy + " " + " ".join(f"{k}={v}" for k, v in details.items() if v)
        if record.alias_target:
            lines.append(f"; ALIAS {owner} {record.type} -> {record.alias_target} ({record.alias_target_type}) not representable in BIND")
            continue
        for value in record.values:
            lines.append(f"{owner}\t{record.ttl}\tIN\t{record.type}\t{value}" + (f"\t{note}" if note else ""))
    return "\n".join(lines) + "\n"


def all_records(db: Session, zone: HostedZone) -> list[DnsRecord]:
    rows, _ = record_repo.search(db, zone, q=None, rtype=None, routing_policy=None, alias=None, sort="name", order="asc", page=1, page_size=10_000_000)
    return rows
