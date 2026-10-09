"""AWS-style ARNs for console resources (shown in list and detail pages, like the real console)."""

ARN_TEMPLATES = {
    "profile": "arn:aws:route53profiles:us-east-1:{account}:profile/{id}",
    "cidr_collection": "arn:aws:route53:::cidrcollection/{id}",
    "resolver_inbound": "arn:aws:route53resolver:us-east-1:{account}:resolver-endpoint/{id}",
    "resolver_outbound": "arn:aws:route53resolver:us-east-1:{account}:resolver-endpoint/{id}",
    "resolver_rule": "arn:aws:route53resolver:us-east-1:{account}:resolver-rule/{id}",
    "query_logging": "arn:aws:route53resolver:us-east-1:{account}:resolver-query-log-config/{id}",
    "fw_rule_group": "arn:aws:route53resolver:us-east-1:{account}:firewall-rule-group/{id}",
    "fw_domain_list": "arn:aws:route53resolver:us-east-1:{account}:firewall-domain-list/{id}",
    "resolver_outpost": "arn:aws:route53resolver:us-east-1:{account}:outpost-resolver/{id}",
    "traffic_policy": "arn:aws:route53:::trafficpolicy/{id}",
    "policy_record": "arn:aws:route53:::trafficpolicyinstance/{id}",
    "domain": "arn:aws:route53domains:us-east-1:{account}:domain/{name}",
}


def account_fields(out: dict, kind: str, account_id: str) -> dict:
    """Adds `owner_account_id` and, when the kind has one, `arn` (without overriding values a kind computes itself)."""
    out.setdefault("owner_account_id", account_id)
    template = ARN_TEMPLATES.get(kind)
    if template and "arn" not in out:
        out["arn"] = template.format(account=account_id, id=out.get("id", ""), name=out.get("name", ""))
    return out
