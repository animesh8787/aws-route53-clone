import json

from tests.conftest import make_record

COLLECTION = {
    "name": "offices",
    "locations": [
        {"name": "london", "cidr_blocks": ["203.0.113.0/24", "2001:db8::/32"]},
        {"name": "paris", "cidr_blocks": ["198.51.100.0/24"]},
    ],
}


def policy_doc(**over):
    doc = {
        "AWSPolicyFormatVersion": "2015-10-01",
        "RecordType": "A",
        "StartRule": "main",
        "Endpoints": {"a": {"Type": "value", "Value": "192.0.2.1"}, "b": {"Type": "value", "Value": "192.0.2.2"}},
        "Rules": {"main": {"RuleType": "failover", "Primary": {"EndpointReference": "a"}, "Secondary": {"EndpointReference": "b"}}},
    }
    doc.update(over)
    return doc


def test_cidr_collection_validation_and_crud(client):
    created = client.post("/api/resources/cidr_collection", json=COLLECTION)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["id"].startswith("cidr-") and body["location_count"] == 2 and body["cidr_count"] == 3

    overlap = {"name": "bad", "locations": [{"name": "a", "cidr_blocks": ["10.0.0.0/16"]}, {"name": "b", "cidr_blocks": ["10.0.1.0/24"]}]}
    res = client.post("/api/resources/cidr_collection", json=overlap)
    assert res.status_code == 422 and "overlaps" in res.json()["detail"]
    host_bits = client.post("/api/resources/cidr_collection", json={"name": "h", "locations": [{"name": "a", "cidr_blocks": ["10.0.0.5/24"]}]})
    assert host_bits.status_code == 422 and "not a valid CIDR" in host_bits.json()["detail"]
    dup = client.post("/api/resources/cidr_collection", json={"name": "d", "locations": [{"name": "a", "cidr_blocks": ["10.0.0.0/24"]}, {"name": "A", "cidr_blocks": ["10.9.0.0/24"]}]})
    assert dup.status_code == 422
    empty = client.post("/api/resources/cidr_collection", json={"name": "e", "locations": [{"name": "a", "cidr_blocks": []}]})
    assert empty.status_code == 422

    upd = client.put(f"/api/resources/cidr_collection/{body['id']}", json={**COLLECTION, "locations": [COLLECTION["locations"][0]]})
    assert upd.json()["location_count"] == 1


def test_ip_based_routing_records_and_resolution(client, zone):
    cid = client.post("/api/resources/cidr_collection", json=COLLECTION).json()["id"]
    zid = zone["zone_id"]
    base = {"type": "A", "name": "ip", "routing_policy": "ipbased", "cidr_collection_id": cid}
    assert make_record(client, zid, **base, values=["1.0.0.1"], set_identifier="uk", cidr_location="london").status_code == 201
    assert make_record(client, zid, **base, values=["1.0.0.2"], set_identifier="fr", cidr_location="paris").status_code == 201
    assert make_record(client, zid, **base, values=["1.0.0.9"], set_identifier="def", cidr_location="*").status_code == 201
    assert make_record(client, zid, **base, values=["1.0.0.3"], set_identifier="uk2", cidr_location="london").status_code == 409
    assert make_record(client, zid, **base, values=["1.0.0.4"], set_identifier="x", cidr_location="nowhere").status_code == 422
    assert make_record(client, zid, **{**base, "cidr_collection_id": "cidr-missing"}, values=["1.0.0.4"], set_identifier="y", cidr_location="*").status_code == 422
    assert make_record(client, zid, type="A", name="ip2", routing_policy="ipbased", values=["1.1.1.1"], set_identifier="z").status_code == 422

    def ask(ip):
        res = client.get("/api/dns/resolve", params={"name": "ip.example.com", "client_ip": ip}).json()
        return res["answers"][0]["value"], res["trace"]

    assert ask("203.0.113.77")[0] == "1.0.0.1"
    assert ask("2001:db8:1::5")[0] == "1.0.0.1"
    assert ask("198.51.100.5")[0] == "1.0.0.2"
    value, trace = ask("8.8.8.8")
    assert value == "1.0.0.9" and "default" in trace[-1]

    # a collection used by records cannot be deleted
    blocked = client.delete(f"/api/resources/cidr_collection/{cid}")
    assert blocked.status_code == 409 and "IP-based routing" in blocked.json()["detail"]
    assert client.get(f"/api/resources/cidr_collection/{cid}").json()["record_count"] == 3


def test_traffic_policy_validation(client):
    ok = client.post("/api/resources/traffic_policy", json={"name": "failover-policy", "record_type": "A", "document": json.dumps(policy_doc())})
    assert ok.status_code == 201, ok.text
    assert ok.json()["latest_version"] == 1 and ok.json()["id"].startswith("tp-")

    def bad(doc, rtype="A", expect=""):
        res = client.post("/api/resources/traffic_policy", json={"name": f"p-{abs(hash(json.dumps(doc)))}", "record_type": rtype, "document": json.dumps(doc) if isinstance(doc, dict) else doc})
        assert res.status_code == 422, res.text
        assert expect in " ".join(e["message"] for e in res.json()["errors"]), res.json()

    bad("{not json", expect="not valid JSON")
    bad(policy_doc(Endpoints={"a": {"Type": "value", "Value": "nope"}, "b": {"Type": "value", "Value": "192.0.2.2"}}), expect="not a valid IPv4")
    bad(policy_doc(Rules={"main": {"RuleType": "failover", "Primary": {"EndpointReference": "zzz"}, "Secondary": {"EndpointReference": "b"}}}), expect="unknown endpoint")
    bad(policy_doc(StartEndpoint="a"), expect="exactly one of StartEndpoint or StartRule")
    bad(policy_doc(RecordType="AAAA"), expect="does not match")
    bad(policy_doc(Rules={"main": {"RuleType": "weighted", "Items": [{"EndpointReference": "a", "Weight": 999}, {"EndpointReference": "b", "Weight": 1}]}}), expect="between 0 and 255")
    bad(policy_doc(Rules={"main": {"RuleType": "failover", "Primary": {"RuleReference": "x"}, "Secondary": {"EndpointReference": "b"}}}), expect="nested rules")
    bad(policy_doc(Endpoints={**policy_doc()["Endpoints"], "orphan": {"Type": "value", "Value": "192.0.2.3"}}), expect="never used")


def test_policy_versions_and_policy_records_materialise_dns_records(client, zone):
    zid = zone["zone_id"]
    created = client.post("/api/resources/traffic_policy", json={"name": "web", "record_type": "A", "document": json.dumps(policy_doc())}).json()
    pid = created["id"]

    # same document -> no new version; changed document -> version 2
    same = client.put(f"/api/resources/traffic_policy/{pid}", json={"name": "web", "record_type": "A", "document": policy_doc(), "description": "x"})
    assert same.json()["latest_version"] == 1
    v2doc = policy_doc(Rules={"main": {"RuleType": "weighted", "Items": [{"EndpointReference": "a", "Weight": 70}, {"EndpointReference": "b", "Weight": 30}]}})
    v2 = client.put(f"/api/resources/traffic_policy/{pid}", json={"name": "web", "record_type": "A", "document": v2doc, "version_comment": "weights"})
    assert v2.json()["latest_version"] == 2 and v2.json()["versions"][1]["comment"] == "weights"

    # policy record -> failover records appear in the zone and are protected
    pr = client.post("/api/resources/policy_record", json={"zone_id": zid, "dns_name": "app", "policy_id": pid, "policy_version": 1, "ttl": 120})
    assert pr.status_code == 201, pr.text
    prid = pr.json()["id"]
    assert pr.json()["record_count"] == 2 and pr.json()["name"] == "app.example.com"
    records = client.get(f"/api/hosted-zones/{zid}/records?q=app").json()["items"]
    assert {r["failover"] for r in records} == {"PRIMARY", "SECONDARY"} and all(r["policy_record_id"] == prid for r in records)
    assert client.delete(f"/api/records/{records[0]['id']}").status_code == 409
    assert client.put(f"/api/records/{records[0]['id']}", json={"type": "A", "name": "app", "ttl": 60, "values": ["9.9.9.9"], "routing_policy": "failover", "set_identifier": "p", "failover": "PRIMARY"}).status_code == 409
    resolved = client.get("/api/dns/resolve", params={"name": "app.example.com"}).json()
    assert resolved["answers"][0]["value"] == "192.0.2.1"

    # switching to version 2 re-materialises as weighted records
    upd = client.put(f"/api/resources/policy_record/{prid}", json={"zone_id": zid, "dns_name": "app", "policy_id": pid, "policy_version": 2, "ttl": 120})
    assert upd.status_code == 200 and upd.json()["record_count"] == 2
    records = client.get(f"/api/hosted-zones/{zid}/records?q=app").json()["items"]
    assert {r["routing_policy"] for r in records} == {"weighted"} and sorted(r["weight"] for r in records) == [30, 70]
    assert client.get(f"/api/hosted-zones/{zid}").json()["record_count"] == 4

    # the policy cannot be deleted while in use; deleting the policy record removes its records
    assert client.delete(f"/api/resources/traffic_policy/{pid}").status_code == 409
    bulk = client.post(f"/api/hosted-zones/{zid}/records/bulk-delete", json={"ids": [r["id"] for r in records]}).json()
    assert bulk["deleted"] == 0 and len(bulk["skipped"]) == 2
    assert client.delete(f"/api/resources/policy_record/{prid}").status_code == 200
    assert client.get(f"/api/hosted-zones/{zid}/records?q=app").json()["total"] == 0
    assert client.get(f"/api/hosted-zones/{zid}").json()["record_count"] == 2
    assert client.delete(f"/api/resources/traffic_policy/{pid}").status_code == 200


def test_policy_record_conflicts_roll_back(client, zone):
    zid = zone["zone_id"]
    make_record(client, zid, type="A", name="taken", values=["1.1.1.1"])
    pid = client.post("/api/resources/traffic_policy", json={"name": "web", "record_type": "A", "document": json.dumps(policy_doc())}).json()["id"]
    res = client.post("/api/resources/policy_record", json={"zone_id": zid, "dns_name": "taken", "policy_id": pid, "policy_version": 1, "ttl": 60})
    assert res.status_code == 409
    assert client.get("/api/resources/policy_record").json()["total"] == 0
    assert client.get(f"/api/hosted-zones/{zid}").json()["record_count"] == 3
    assert client.post("/api/resources/policy_record", json={"zone_id": zid, "dns_name": "x", "policy_id": pid, "policy_version": 9, "ttl": 60}).status_code == 422
    assert client.post("/api/resources/policy_record", json={"zone_id": "Znope", "dns_name": "x", "policy_id": pid, "policy_version": 1, "ttl": 60}).status_code == 422


def test_alias_and_geo_policies_materialise(client, zone):
    zid = zone["zone_id"]
    doc = {
        "RecordType": "A", "StartRule": "geo",
        "Endpoints": {"cdn": {"Type": "cloudfront", "Value": "d1.cloudfront.net"}, "eu": {"Type": "value", "Value": "192.0.2.50"}},
        "Rules": {"geo": {"RuleType": "geo", "Locations": [{"EndpointReference": "cdn", "IsDefault": True}, {"EndpointReference": "eu", "Continent": "EU"}]}},
    }
    pid = client.post("/api/resources/traffic_policy", json={"name": "geo", "record_type": "A", "document": doc}).json()["id"]
    pr = client.post("/api/resources/policy_record", json={"zone_id": zid, "dns_name": "geo", "policy_id": pid, "policy_version": 1, "ttl": 60})
    assert pr.status_code == 201, pr.text
    recs = client.get(f"/api/hosted-zones/{zid}/records?q=geo").json()["items"]
    assert sorted(r["geo_country"] or r["geo_continent"] for r in recs) == ["*", "EU"]
    assert any(r["alias"] and r["alias"]["target_type"] == "cloudfront" for r in recs)
    ans = client.get("/api/dns/resolve", params={"name": "geo.example.com", "client_continent": "EU"}).json()
    assert ans["answers"][0]["value"] == "192.0.2.50"
