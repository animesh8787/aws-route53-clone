from tests.conftest import make_record

VPC = "vpc-0a1b2c3d4e5f60789"  # 10.0.0.0/16
VPC2 = "vpc-0f9e8d7c6b5a43210"
SG = ["sg-0a1b2c3d4e"]


def endpoint(client, kind="resolver_outbound", **over):
    body = {
        "name": "ep", "vpc_id": VPC, "security_group_ids": SG, "protocols": ["Do53"],
        "ip_addresses": [{"subnet_id": "subnet-0a1b2c3d", "ip": ""}, {"subnet_id": "subnet-0b2c3d4e", "ip": "10.0.5.10"}], **over,
    }  # fmt: skip
    return client.post(f"/api/resources/{kind}", json=body)


def test_endpoints_validate_and_auto_assign_ips(client):
    ok = endpoint(client, "resolver_inbound", name="in-1")
    assert ok.status_code == 201, ok.text
    body = ok.json()
    assert body["id"].startswith("rslvr-in-") and body["direction"] == "INBOUND" and body["status"] == "OPERATIONAL"
    ips = [a["ip"] for a in body["ip_addresses"]]
    assert ips[1] == "10.0.5.10" and ips[0].startswith("10.0.0.") and len(set(ips)) == 2

    assert endpoint(client, "resolver_inbound", name="dup-ip", ip_addresses=[{"subnet_id": "subnet-0a1b2c3d", "ip": "10.0.5.10"}, {"subnet_id": "subnet-0b2c3d4e", "ip": ""}]).status_code == 422
    assert endpoint(client, name="one-ip", ip_addresses=[{"subnet_id": "subnet-0a1b2c3d", "ip": ""}]).status_code == 422
    assert endpoint(client, name="outside", ip_addresses=[{"subnet_id": "subnet-0a1b2c3d", "ip": "192.168.1.5"}, {"subnet_id": "subnet-0b2c3d4e", "ip": ""}]).status_code == 422
    assert endpoint(client, name="reserved", ip_addresses=[{"subnet_id": "subnet-0a1b2c3d", "ip": "10.0.0.2"}, {"subnet_id": "subnet-0b2c3d4e", "ip": ""}]).status_code == 422
    assert endpoint(client, name="badsg", security_group_ids=["nope"]).status_code == 422
    assert endpoint(client, name="badvpc", vpc_id="vpc-nope").status_code == 422
    dup_name = endpoint(client, "resolver_inbound", name="in-1", ip_addresses=[{"subnet_id": "subnet-0a1b2c3d", "ip": "10.0.7.1"}, {"subnet_id": "subnet-0b2c3d4e", "ip": "10.0.7.2"}])
    assert dup_name.status_code == 409


def rule_body(endpoint_id, **over):
    return {
        "name": "corp-forward", "rule_type": "FORWARD", "domain_name": "corp.example.com",
        "target_ips": [{"ip": "10.9.9.9", "port": 53}], "outbound_endpoint_id": endpoint_id, "vpc_ids": [VPC], **over,
    }  # fmt: skip


def test_resolver_rules_and_endpoint_delete_guard(client):
    out_id = endpoint(client, name="out-1").json()["id"]
    created = client.post("/api/resources/resolver_rule", json=rule_body(out_id))
    assert created.status_code == 201, created.text
    assert created.json()["domain_name"] == "corp.example.com"

    assert client.post("/api/resources/resolver_rule", json=rule_body(out_id, name="other")).status_code == 409  # same domain on the same VPC
    assert client.post("/api/resources/resolver_rule", json=rule_body(out_id, name="o2", vpc_ids=[VPC2])).status_code == 201
    assert client.post("/api/resources/resolver_rule", json=rule_body("rslvr-out-x", name="o3", domain_name="x.example.com")).status_code == 422
    assert client.post("/api/resources/resolver_rule", json=rule_body(out_id, name="o4", domain_name="x.example.com", target_ips=[{"ip": "nope", "port": 53}])).status_code == 422
    assert client.post("/api/resources/resolver_rule", json=rule_body(out_id, name="o5", domain_name="y.example.com", target_ips=[])).status_code == 422
    recursive = client.post("/api/resources/resolver_rule", json={"name": "rec", "rule_type": "RECURSIVE", "vpc_ids": [VPC2]})
    assert recursive.status_code == 201 and recursive.json()["domain_name"] == "."

    blocked = client.delete(f"/api/resources/resolver_outbound/{out_id}")
    assert blocked.status_code == 409 and "forwarding rule" in blocked.json()["detail"]


def test_query_logging_arn_validation(client):
    ok = client.post("/api/resources/query_logging", json={"name": "logs", "destination_type": "cloudwatch-logs", "destination_arn": "arn:aws:logs:us-east-1:123456789012:log-group:/dns", "vpc_ids": [VPC]})
    assert ok.status_code == 201, ok.text
    assert client.post("/api/resources/query_logging", json={"name": "s3", "destination_type": "s3", "destination_arn": "arn:aws:s3:::my-bucket/prefix", "vpc_ids": []}).status_code == 201
    bad = client.post("/api/resources/query_logging", json={"name": "bad", "destination_type": "firehose", "destination_arn": "arn:aws:s3:::wrong", "vpc_ids": []})
    assert bad.status_code == 422 and bad.json()["errors"][0]["field"] == "destination_arn"
    assert client.get("/api/resources/query_logging?filter_destination_type=s3").json()["total"] == 1


def test_firewall_domain_lists_and_rule_groups(client):
    dl = client.post("/api/resources/fw_domain_list", json={"name": "bad-domains", "domains": ["Evil.Example.com.", "*.malware.example", "evil.example.com", "  "]})
    assert dl.status_code == 201, dl.text
    assert dl.json()["domains"] == ["evil.example.com", "*.malware.example"] and dl.json()["domain_count"] == 2
    assert client.post("/api/resources/fw_domain_list", json={"name": "x", "domains": ["not a domain"]}).status_code == 422
    assert client.post("/api/resources/fw_domain_list", json={"name": "y", "domains": ["localhost"]}).status_code == 422
    dl_id = dl.json()["id"]

    rule = {"name": "block-bad", "priority": 10, "domain_list_id": dl_id, "action": "BLOCK", "block_response": "NXDOMAIN"}
    group = client.post("/api/resources/fw_rule_group", json={"name": "grp", "rules": [rule], "associations": [{"vpc_id": VPC, "priority": 200}]})
    assert group.status_code == 201, group.text
    assert group.json()["rule_count"] == 1 and group.json()["vpc_count"] == 1

    assert client.post("/api/resources/fw_rule_group", json={"name": "g2", "rules": [rule, {**rule, "name": "r2"}]}).status_code == 422  # duplicate priority
    assert client.post("/api/resources/fw_rule_group", json={"name": "g3", "rules": [{**rule, "domain_list_id": "rslvr-fdl-missing"}]}).status_code == 422
    assert client.post("/api/resources/fw_rule_group", json={"name": "g4", "rules": [{**rule, "block_response": "OVERRIDE", "override_domain": "bad host"}]}).status_code == 422
    assert client.post("/api/resources/fw_rule_group", json={"name": "g5", "associations": [{"vpc_id": VPC, "priority": 200}]}).status_code == 409  # priority taken on the VPC
    assert client.post("/api/resources/fw_rule_group", json={"name": "g6", "associations": [{"vpc_id": VPC, "priority": 50}]}).status_code == 422

    blocked = client.delete(f"/api/resources/fw_domain_list/{dl_id}")
    assert blocked.status_code == 409 and "grp" in blocked.json()["detail"]


def test_simulator_applies_firewall_rules_zones_and_forwarding(client, zone):
    zid = zone["zone_id"]
    make_record(client, zid, type="A", name="evil", values=["6.6.6.6"])
    make_record(client, zid, type="A", name="www", values=["1.1.1.1"])
    dl_id = client.post("/api/resources/fw_domain_list", json={"name": "bad", "domains": ["evil.example.com"]}).json()["id"]
    allow_id = client.post("/api/resources/fw_domain_list", json={"name": "ok", "domains": ["*.example.com"]}).json()["id"]

    def groups(block):
        rules = [
            {"name": "block", "priority": 20, "domain_list_id": dl_id, "action": "BLOCK", **block},
            {"name": "allow-rest", "priority": 90, "domain_list_id": allow_id, "action": "ALERT"},
        ]
        return {"name": "fw", "rules": rules, "associations": [{"vpc_id": VPC, "priority": 300}]}

    res = client.post("/api/resources/fw_rule_group", json=groups({"block_response": "NODATA"}))
    gid = res.json()["id"]
    ask = lambda name, **q: client.get("/api/dns/resolve", params={"name": name, "source_vpc": VPC, **q}).json()  # noqa: E731

    nodata = ask("evil.example.com")
    assert nodata["rcode"] == "NOERROR" and nodata["answers"] == [] and nodata["blocked_by"] == "block"
    assert any("BLOCK by rule 'block'" in t for t in nodata["trace"])
    ok = ask("www.example.com")
    assert ok["answers"][0]["value"] == "1.1.1.1" and any("ALERT" in t for t in ok["trace"])
    # other VPC is not covered by the group
    assert client.get("/api/dns/resolve", params={"name": "evil.example.com", "source_vpc": VPC2}).json()["answers"][0]["value"] == "6.6.6.6"
    assert client.get("/api/dns/resolve", params={"name": "evil.example.com"}).json()["answers"][0]["value"] == "6.6.6.6"

    client.put(f"/api/resources/fw_rule_group/{gid}", json=groups({"block_response": "NXDOMAIN"}))
    assert ask("evil.example.com")["rcode"] == "NXDOMAIN"
    client.put(f"/api/resources/fw_rule_group/{gid}", json=groups({"block_response": "OVERRIDE", "override_domain": "sinkhole.example.net"}))
    override = ask("evil.example.com")
    assert override["answers"][0]["type"] == "CNAME" and override["answers"][0]["value"] == "sinkhole.example.net."

    # forwarding rule: names outside every hosted zone are forwarded
    out_id = endpoint(client, name="fwd-out").json()["id"]
    client.post("/api/resources/resolver_rule", json=rule_body(out_id, domain_name="corp.internal.test"))
    fwd = ask("db.corp.internal.test")
    assert fwd["forwarded_to"] == ["10.9.9.9:53"] and fwd["routing_policy"] == "forwarded"
    assert ask("nothing.unknown.test")["rcode"] == "REFUSED"
    assert client.get("/api/dns/resolve", params={"name": "db.corp.internal.test"}).json()["rcode"] == "REFUSED"  # no VPC, no forwarding
    assert client.get("/api/dns/resolve", params={"name": "x.example.com", "source_vpc": "vpc-nope"}).json()["rcode"] == "FORMERR"


def test_private_zones_only_visible_from_associated_vpcs(client):
    private = client.post("/api/hosted-zones", json={"name": "corp.internal", "type": "private", "vpc": {"vpc_id": VPC, "region": "us-east-1"}}).json()
    make_record(client, private["zone_id"], type="A", name="db", values=["10.0.0.50"])
    inside = client.get("/api/dns/resolve", params={"name": "db.corp.internal", "source_vpc": VPC}).json()
    assert inside["answers"][0]["value"] == "10.0.0.50" and "private hosted zone" in inside["trace"][-2]
    outside = client.get("/api/dns/resolve", params={"name": "db.corp.internal", "source_vpc": VPC2}).json()
    assert outside["rcode"] == "REFUSED"


def test_resolver_vpc_overview_and_profile_cleanup(client):
    out_id = endpoint(client, name="ov-out").json()["id"]
    rule_id = client.post("/api/resources/resolver_rule", json=rule_body(out_id, name="ov-rule")).json()["id"]
    profile = client.post("/api/resources/profile", json={"name": "p", "resource_ids": [rule_id]})
    assert profile.status_code == 201, profile.text

    listing = client.get("/api/resolver/vpcs").json()
    assert listing["total"] == 6
    prod = next(v for v in listing["items"] if v["id"] == VPC)
    assert prod["endpoint_count"] == 1 and prod["rule_count"] == 1 and prod["outbound_endpoints"][0]["name"] == "ov-out"
    assert client.get("/api/resolver/vpcs?q=eu-").json()["total"] == 2
    detail = client.get(f"/api/resolver/vpcs/{VPC}").json()
    assert detail["rules"][0]["id"] == rule_id
    assert client.get("/api/resolver/vpcs/vpc-nope").status_code == 404

    assert client.delete(f"/api/resources/resolver_rule/{rule_id}").status_code == 200
    assert client.get(f"/api/resources/profile/{profile.json()['id']}").json()["resource_ids"] == []
