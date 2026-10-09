"""Monthly cost *estimate* computed from the account's resources.

Prices are illustrative US East list prices kept in one table so they are easy to review. This is not a bill:
no usage is metered (for example DNS queries are not counted) and nothing is ever charged.
"""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import HealthCheck, HostedZone, Resource
from app.services import domain_service

HOURS_PER_MONTH = 730

PRICES = [
    {"id": "zone-first", "service": "Route 53 hosted zones", "unit": "hosted zone / month (first 25)", "price": 0.50},
    {"id": "zone-more", "service": "Route 53 hosted zones", "unit": "hosted zone / month (after 25)", "price": 0.10},
    {"id": "health-basic", "service": "Route 53 health checks", "unit": "health check / month (basic)", "price": 0.75},
    {"id": "health-option", "service": "Route 53 health checks", "unit": "optional feature / month (HTTPS, string matching, fast interval)", "price": 1.00},
    {"id": "policy-record", "service": "Route 53 traffic flow", "unit": "policy record / month", "price": 50.00},
    {"id": "domain", "service": "Route 53 domain registration", "unit": "per year, by TLD (shown as a monthly share)", "price": None},
    {"id": "resolver-eni", "service": "Route 53 Resolver", "unit": "endpoint IP address (network interface) / hour", "price": 0.125},
    {"id": "firewall-group", "service": "Route 53 Resolver DNS Firewall", "unit": "rule group associated with a VPC / month", "price": 1.00},
    {"id": "firewall-list", "service": "Route 53 Resolver DNS Firewall", "unit": "domain list / month", "price": 0.50},
    {"id": "query-logging", "service": "Route 53 Resolver query logging", "unit": "configuration / month (log storage not included)", "price": 0.00},
]


def _line(service: str, description: str, quantity: float, unit_price: float, monthly: float) -> dict:
    return {"service": service, "description": description, "quantity": round(quantity, 2), "unit_price": unit_price, "monthly": round(monthly, 2)}


def estimate(db: Session, owner_id: int) -> dict:
    lines: list[dict] = []
    zones = db.scalar(select(func.count()).select_from(HostedZone)) or 0
    if zones:
        first, more = min(zones, 25), max(zones - 25, 0)
        lines.append(_line("Route 53 hosted zones", "First 25 hosted zones", first, 0.50, first * 0.50))
        if more:
            lines.append(_line("Route 53 hosted zones", "Additional hosted zones", more, 0.10, more * 0.10))

    checks = db.scalars(select(HealthCheck).where(HealthCheck.owner_id == owner_id)).all()
    if checks:
        options = sum((c.type in ("HTTPS", "HTTPS_STR_MATCH")) + (c.type.endswith("STR_MATCH")) + (c.request_interval == 10) for c in checks)
        lines.append(_line("Route 53 health checks", "Basic health checks", len(checks), 0.75, len(checks) * 0.75))
        if options:
            lines.append(_line("Route 53 health checks", "Optional features (HTTPS, string matching, fast interval)", options, 1.00, options * 1.00))

    resources = db.scalars(select(Resource).where(Resource.owner_id == owner_id)).all()
    by_kind: dict[str, list[Resource]] = {}
    for r in resources:
        by_kind.setdefault(r.kind, []).append(r)

    policy_records = len(by_kind.get("policy_record", []))
    if policy_records:
        lines.append(_line("Route 53 traffic flow", "Traffic policy records", policy_records, 50.00, policy_records * 50.00))

    domains = by_kind.get("domain", [])
    if domains:
        yearly = sum(domain_service.price_for(d.name.rsplit(".", 1)[-1]) or 0 for d in domains)
        lines.append(_line("Route 53 domain registration", "Registered domains (yearly price shown monthly)", len(domains), round(yearly / len(domains) / 12, 2), yearly / 12))

    enis = sum(len(r.data.get("ip_addresses", [])) for k in ("resolver_inbound", "resolver_outbound") for r in by_kind.get(k, []))
    if enis:
        lines.append(_line("Route 53 Resolver", "Endpoint IP addresses (730 hours)", enis, round(0.125 * HOURS_PER_MONTH, 2), enis * 0.125 * HOURS_PER_MONTH))

    associations = sum(len(g.data.get("associations", [])) for g in by_kind.get("fw_rule_group", []))
    if associations:
        lines.append(_line("Route 53 Resolver DNS Firewall", "Rule group VPC associations", associations, 1.00, associations * 1.00))
    lists = len(by_kind.get("fw_domain_list", []))
    if lists:
        lines.append(_line("Route 53 Resolver DNS Firewall", "Domain lists", lists, 0.50, lists * 0.50))

    by_service: dict[str, float] = {}
    for line in lines:
        by_service[line["service"]] = round(by_service.get(line["service"], 0) + line["monthly"], 2)
    total = round(sum(by_service.values()), 2)
    return {
        "currency": "USD", "total": total, "lines": lines, "by_service": [{"service": s, "monthly": m} for s, m in by_service.items()], "prices": PRICES,
        "disclaimer": "Estimate only. Prices are illustrative, usage such as DNS queries is not metered, and nothing is charged by this console clone.",
    }  # fmt: skip
