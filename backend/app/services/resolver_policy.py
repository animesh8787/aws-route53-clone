"""VPC-level DNS policy used by the query simulator: DNS Firewall, forwarding rules and query logging."""
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Resource


@dataclass
class FirewallVerdict:
    action: str  # ALLOW | BLOCK | NONE
    trace: list[str] = field(default_factory=list)
    block_response: str = ""
    override_domain: str = ""
    override_ttl: int = 60
    rule: str = ""


def _owned(db: Session, owner_id: int, kind: str) -> list[Resource]:
    return list(db.scalars(select(Resource).where(Resource.owner_id == owner_id, Resource.kind == kind)))


def domain_matches(name: str, pattern: str) -> bool:
    name = name.rstrip(".").lower()
    if pattern.startswith("*."):
        return name.endswith("." + pattern[2:])
    return name == pattern


def evaluate_firewall(db: Session, owner_id: int, vpc_id: str, name: str) -> FirewallVerdict:
    """Apply the VPC's rule groups in association-priority order, then each group's rules in priority order."""
    verdict = FirewallVerdict(action="NONE")
    lists = {r.public_id: r for r in _owned(db, owner_id, "fw_domain_list")}
    groups = []
    for group in _owned(db, owner_id, "fw_rule_group"):
        for assoc in group.data.get("associations", []):
            if assoc["vpc_id"] == vpc_id:
                groups.append((assoc["priority"], group))
    if not groups:
        verdict.trace.append(f"DNS Firewall: no rule groups are associated with {vpc_id}.")
        return verdict
    for _, group in sorted(groups, key=lambda g: g[0]):
        for rule in sorted(group.data.get("rules", []), key=lambda r: r["priority"]):
            domain_list = lists.get(rule["domain_list_id"])
            if domain_list is None or not any(domain_matches(name, p) for p in domain_list.data.get("domains", [])):
                continue
            where = f"rule '{rule['name']}' (priority {rule['priority']}) in group '{group.name}'"
            if rule["action"] == "ALLOW":
                verdict.trace.append(f"DNS Firewall: ALLOW by {where}; the query continues.")
                verdict.action = "ALLOW"
                return verdict
            if rule["action"] == "ALERT":
                verdict.trace.append(f"DNS Firewall: ALERT by {where}; the query continues and an alert is logged.")
                continue
            verdict.trace.append(f"DNS Firewall: BLOCK by {where} with response {rule['block_response']}.")
            return FirewallVerdict(
                action="BLOCK", trace=verdict.trace, block_response=rule["block_response"], override_domain=rule.get("override_domain", ""),
                override_ttl=rule.get("override_ttl", 60), rule=rule["name"],
            )  # fmt: skip
    verdict.trace.append("DNS Firewall: no rule matched the query.")
    return verdict


def matching_rule(db: Session, owner_id: int, vpc_id: str, name: str) -> Resource | None:
    """The most specific resolver rule (longest domain suffix) associated with the VPC that matches the name."""
    host = name.rstrip(".").lower()
    best: Resource | None = None
    for rule in _owned(db, owner_id, "resolver_rule"):
        if vpc_id not in rule.data.get("vpc_ids", []):
            continue
        domain = rule.data["domain_name"].lower()
        if domain == "." or host == domain or host.endswith("." + domain):
            if best is None or len(domain) > len(best.data["domain_name"]):
                best = rule
    return best


def logging_destinations(db: Session, owner_id: int, vpc_id: str) -> list[Resource]:
    return [r for r in _owned(db, owner_id, "query_logging") if vpc_id in r.data.get("vpc_ids", [])]
