from tests.conftest import make_record


def test_activity_feed_records_changes_and_marks_read(client, zone):
    zid = zone["zone_id"]
    rec = make_record(client, zid, type="A", name="www", values=["1.1.1.1"]).json()
    client.put(f"/api/records/{rec['id']}", json={"type": "A", "name": "www", "ttl": 60, "values": ["2.2.2.2"]})
    client.post(f"/api/hosted-zones/{zid}/import", json={"content": "x 300 IN A 3.3.3.3\n", "dry_run": False})
    client.delete(f"/api/records/{rec['id']}")
    client.put(f"/api/hosted-zones/{zid}", json={"comment": "changed"})

    summary = client.get("/api/activity/summary").json()
    assert summary["unread"] >= 5 and summary["total"] >= 5
    actions = [(e["action"], e["resource_type"]) for e in summary["items"]]
    assert ("created", "Hosted zone") in actions and ("created", "Record") in actions and ("imported", "Zone file") in actions
    assert ("deleted", "Record") in actions and ("updated", "Hosted zone") in actions
    assert summary["items"][0]["href"]

    assert client.post("/api/activity/read").status_code == 200
    assert client.get("/api/activity/summary").json()["unread"] == 0
    page = client.get("/api/activity?filter_action=created&page_size=1").json()
    assert page["total"] >= 2 and page["items"][0]["action"] == "created"
    assert client.get("/api/activity?q=www").json()["total"] >= 1


def test_billing_estimate_follows_resources(client, zone):
    empty = client.get("/api/billing/estimate").json()
    zones_line = next(line for line in empty["lines"] if "hosted zones" in line["service"])
    assert zones_line["quantity"] == 1 and zones_line["monthly"] == 0.50
    assert empty["total"] > 0.50 and empty["disclaimer"] and empty["prices"]

    client.post("/api/health-checks", json={"name": "hc", "type": "HTTPS", "endpoint": "example.com", "port": 443})
    with_hc = client.get("/api/billing/estimate").json()
    assert round(with_hc["total"] - empty["total"], 2) == 1.75  # basic 0.75 + HTTPS option 1.00
    pid = client.post("/api/resources/traffic_policy", json={"name": "p", "record_type": "A", "document": {
        "RecordType": "A", "StartEndpoint": "a", "Endpoints": {"a": {"Type": "value", "Value": "192.0.2.1"}}}}).json()["id"]
    client.post("/api/resources/policy_record", json={"zone_id": zone["zone_id"], "dns_name": "tp", "policy_id": pid, "policy_version": 1, "ttl": 60})
    assert round(client.get("/api/billing/estimate").json()["total"] - with_hc["total"], 2) == 50.00
    services = {s["service"] for s in client.get("/api/billing/estimate").json()["by_service"]}
    assert {"Route 53 hosted zones", "Route 53 health checks", "Route 53 traffic flow"} <= services


def test_hosted_zone_tags(client, zone):
    zid = zone["zone_id"]
    assert client.get(f"/api/hosted-zones/{zid}/tags").json() == {"tags": []}
    ok = client.put(f"/api/hosted-zones/{zid}/tags", json={"tags": [{"key": "Env", "value": "prod"}, {"key": "Owner", "value": " me "}]})
    assert ok.status_code == 200 and ok.json()["tags"][1] == {"key": "Owner", "value": "me"}
    assert client.get(f"/api/hosted-zones/{zid}").json()["tags"][0]["key"] == "Env"
    assert client.put(f"/api/hosted-zones/{zid}/tags", json={"tags": [{"key": "a", "value": ""}, {"key": "a", "value": "x"}]}).status_code == 422
    assert client.put(f"/api/hosted-zones/{zid}/tags", json={"tags": [{"key": "aws:internal", "value": "x"}]}).status_code == 422
    assert client.put(f"/api/hosted-zones/{zid}/tags", json={"tags": [{"key": "", "value": "x"}]}).status_code == 422
    assert client.put(f"/api/hosted-zones/{zid}/tags", json={"tags": [{"key": f"k{i}", "value": ""} for i in range(51)]}).status_code == 422
    assert client.put(f"/api/hosted-zones/{zid}/tags", json={"tags": []}).json() == {"tags": []}


def test_dnssec_enable_disable_and_private_zone_rule(client, zone):
    zid = zone["zone_id"]
    assert client.get(f"/api/hosted-zones/{zid}/dnssec").json()["status"] == "NOT_SIGNING"
    assert client.post(f"/api/hosted-zones/{zid}/dnssec/disable").status_code == 409
    assert client.post(f"/api/hosted-zones/{zid}/dnssec/enable", json={"ksk_name": "x!", "kms_key_alias": "alias/ok"}).status_code == 422
    assert client.post(f"/api/hosted-zones/{zid}/dnssec/enable", json={"ksk_name": "valid_ksk", "kms_key_alias": "not-an-alias"}).status_code == 422
    on = client.post(f"/api/hosted-zones/{zid}/dnssec/enable", json={"ksk_name": "valid_ksk", "kms_key_alias": "alias/dnssec"})
    assert on.status_code == 200
    ksk = on.json()["ksk"]
    assert on.json()["status"] == "SIGNING" and ksk["algorithm"]["name"] == "ECDSAP256SHA256" and ksk["ds_record"].split()[1:3] == ["13", "2"]
    assert len(ksk["digest"]) == 64
    assert client.get(f"/api/hosted-zones/{zid}").json()["dnssec_status"] == "SIGNING"
    assert client.post(f"/api/hosted-zones/{zid}/dnssec/enable", json={"ksk_name": "again_ksk"}).status_code == 409
    off = client.post(f"/api/hosted-zones/{zid}/dnssec/disable").json()
    assert off["status"] == "NOT_SIGNING" and off["ksk"] is None

    private = client.post("/api/hosted-zones", json={"name": "corp.internal", "type": "private", "vpc": {"vpc_id": "vpc-0a1b2c3d4e5f60789", "region": "us-east-1"}}).json()
    res = client.post(f"/api/hosted-zones/{private['zone_id']}/dnssec/enable", json={"ksk_name": "valid_ksk"})
    assert res.status_code == 409 and "public" in res.json()["detail"]
