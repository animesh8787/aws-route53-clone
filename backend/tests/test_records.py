import pytest

from tests.conftest import make_record


def rec(client, zone, **kw):
    return make_record(client, zone["zone_id"], **kw)


VALID = [
    ("A", ["192.0.2.1"], "192.0.2.1"),
    ("AAAA", ["2001:0db8:0000::0001"], "2001:db8::1"),
    ("CNAME", ["Target.Example.NET"], "target.example.net."),
    ("TXT", ["v=spf1 -all"], '"v=spf1 -all"'),
    ("MX", ["10 mail.example.com", "20 backup.example.com."], "10 mail.example.com."),
    ("NS", ["ns1.other.com", "ns2.other.com"], "ns1.other.com."),
    ("PTR", ["host.example.com"], "host.example.com."),
    ("SRV", ["10 5 5060 sip.example.com"], "10 5 5060 sip.example.com."),
    ("CAA", ['0 issue "letsencrypt.org"'], '0 issue "letsencrypt.org"'),
]


@pytest.mark.parametrize(("rtype", "values", "first"), VALID)
def test_create_each_record_type(client, zone, rtype, values, first):
    name = "sub" if rtype != "SRV" else "_sip._tcp"
    res = rec(client, zone, type=rtype, name=name, values=values)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["values"][0] == first
    assert body["name"] == f"{name}.example.com."
    assert body["parsed_values"]
    assert client.get(f"/api/records/{body['id']}").json()["values"] == body["values"]


INVALID = [
    ("A", ["999.1.1.1"]), ("A", ["2001:db8::1"]), ("AAAA", ["1.2.3.4"]), ("CNAME", ["bad host"]),
    ("MX", ["mail.example.com"]), ("MX", ["70000 mail.example.com"]), ("SRV", ["1 2 99999 host.example.com"]),
    ("CAA", ['0 bogus "x"']), ("CAA", ["0 issue"]), ("TXT", ['"unterminated']), ("NS", ["-bad-.com"]),
]  # fmt: skip


@pytest.mark.parametrize(("rtype", "values"), INVALID)
def test_invalid_values_rejected_with_field_errors(client, zone, rtype, values):
    res = rec(client, zone, type=rtype, name="x", values=values)
    assert res.status_code == 422
    assert res.json()["errors"][0]["field"].startswith("values")


def test_name_rules(client, zone):
    assert rec(client, zone, type="A", name="www.example.com", values=["1.1.1.1"]).json()["name"] == "www.example.com."
    assert rec(client, zone, type="A", name="@", values=["1.1.1.1"]).json()["name"] == "example.com."
    assert rec(client, zone, type="A", name="*.wild", values=["1.1.1.1"]).status_code == 201
    out = rec(client, zone, type="A", name="www.other.com.", values=["1.1.1.1"])
    assert out.status_code == 422 and out.json()["errors"][0]["field"] == "name"
    assert rec(client, zone, type="A", name="a*b", values=["1.1.1.1"]).status_code == 422
    assert rec(client, zone, type="A", name="a" * 64, values=["1.1.1.1"]).status_code == 422
    assert rec(client, zone, type="HINFO", name="x", values=["a"]).status_code == 422
    assert rec(client, zone, type="A", name="ttl", values=["1.1.1.1"], ttl=-1).status_code == 422


def test_txt_quoting_multiple_strings_and_long_values(client, zone):
    r = rec(client, zone, type="TXT", name="t", values=['"part one" "part \\"two\\""'])
    assert r.json()["values"] == ['"part one" "part \\"two\\""']
    assert r.json()["parsed_values"][0]["strings"] == ["part one", 'part "two"']
    long_raw = rec(client, zone, type="TXT", name="long", values=["x" * 600]).json()
    assert len(long_raw["parsed_values"][0]["strings"]) == 3  # auto-split into 255-char strings


def test_cname_conflicts(client, zone):
    assert rec(client, zone, type="A", name="www", values=["1.1.1.1"]).status_code == 201
    assert rec(client, zone, type="CNAME", name="www", values=["x.com"]).status_code == 409
    assert rec(client, zone, type="CNAME", name="blog", values=["x.com"]).status_code == 201
    assert rec(client, zone, type="TXT", name="blog", values=["hi"]).status_code == 409
    assert rec(client, zone, type="CNAME", name="@", values=["x.com"]).status_code == 422  # apex
    assert rec(client, zone, type="CNAME", name="multi", values=["a.com", "b.com"]).status_code == 422


def test_duplicate_and_system_protection(client, zone):
    assert rec(client, zone, type="A", name="dup", values=["1.1.1.1"]).status_code == 201
    assert rec(client, zone, type="A", name="dup", values=["2.2.2.2"]).status_code == 409
    assert rec(client, zone, type="NS", name="@", values=["ns.x.com"]).status_code == 409
    recs = client.get(f"/api/hosted-zones/{zone['zone_id']}/records").json()["items"]
    soa = next(r for r in recs if r["type"] == "SOA")
    assert client.delete(f"/api/records/{soa['id']}").status_code == 403
    ttl_edit = client.put(f"/api/records/{soa['id']}", json={"type": "SOA", "name": "@", "ttl": 1200, "values": soa["values"]})
    assert ttl_edit.status_code == 200 and ttl_edit.json()["ttl"] == 1200
    rename = client.put(f"/api/records/{soa['id']}", json={"type": "SOA", "name": "www", "ttl": 1200, "values": soa["values"]})
    assert rename.status_code == 403


def test_update_and_delete_record_updates_count(client, zone):
    r = rec(client, zone, type="A", name="web", values=["1.1.1.1"]).json()
    assert client.get(f"/api/hosted-zones/{zone['zone_id']}").json()["record_count"] == 3
    upd = client.put(f"/api/records/{r['id']}", json={"type": "A", "name": "web", "ttl": 60, "values": ["3.3.3.3", "4.4.4.4"]})
    assert upd.status_code == 200 and upd.json()["values"] == ["3.3.3.3", "4.4.4.4"] and upd.json()["ttl"] == 60
    assert client.delete(f"/api/records/{r['id']}").status_code == 200
    assert client.get(f"/api/records/{r['id']}").status_code == 404
    assert client.get(f"/api/hosted-zones/{zone['zone_id']}").json()["record_count"] == 2


def test_routing_policies(client, zone):
    w = {"type": "A", "name": "w", "routing_policy": "weighted"}
    assert rec(client, zone, **w, values=["1.1.1.1"], weight=10).status_code == 422  # needs set id
    assert rec(client, zone, **w, values=["1.1.1.1"], set_identifier="a", weight=300).status_code == 422
    assert rec(client, zone, **w, values=["1.1.1.1"], set_identifier="a", weight=10).status_code == 201
    assert rec(client, zone, **w, values=["2.2.2.2"], set_identifier="b", weight=90).status_code == 201
    assert rec(client, zone, **w, values=["3.3.3.3"], set_identifier="a", weight=1).status_code == 409
    assert rec(client, zone, type="A", name="w", values=["9.9.9.9"]).status_code == 409  # simple vs weighted

    lat = {"type": "A", "name": "l", "routing_policy": "latency"}
    assert rec(client, zone, **lat, values=["1.1.1.1"], set_identifier="x", region="mars-1").status_code == 422
    assert rec(client, zone, **lat, values=["1.1.1.1"], set_identifier="x", region="us-east-1").status_code == 201
    assert rec(client, zone, **lat, values=["1.1.1.2"], set_identifier="y", region="us-east-1").status_code == 409

    fo = {"type": "A", "name": "f", "routing_policy": "failover"}
    assert rec(client, zone, **fo, values=["1.1.1.1"], set_identifier="p", failover="PRIMARY", health_check_id="hc-0a1b2c3d4e5f6a7b8").status_code == 201
    assert rec(client, zone, **fo, values=["1.1.1.2"], set_identifier="p2", failover="PRIMARY").status_code == 409
    assert rec(client, zone, **fo, values=["1.1.1.2"], set_identifier="s", failover="SECONDARY").status_code == 201
    assert rec(client, zone, **fo, values=["1.1.1.2"], set_identifier="z", failover="NOPE").status_code == 422
    assert rec(client, zone, type="A", name="h", values=["1.1.1.1"], health_check_id="hc-missing").status_code == 422

    geo = {"type": "A", "name": "g", "routing_policy": "geolocation"}
    assert rec(client, zone, **geo, values=["1.1.1.1"], set_identifier="g1").status_code == 422
    assert rec(client, zone, **geo, values=["1.1.1.1"], set_identifier="g1", geo_country="DE").status_code == 201
    assert rec(client, zone, **geo, values=["1.1.1.2"], set_identifier="g2", geo_country="DE").status_code == 409
    assert rec(client, zone, **geo, values=["1.1.1.2"], set_identifier="g3", geo_continent="EU", geo_country="FR").status_code == 422
    assert rec(client, zone, **geo, values=["1.1.1.2"], set_identifier="g4", geo_country="US", geo_subdivision="CA").status_code == 201

    mv = {"type": "A", "name": "m", "routing_policy": "multivalue"}
    assert rec(client, zone, **mv, values=["1.1.1.1", "1.1.1.2"], set_identifier="m1").status_code == 422
    assert rec(client, zone, **mv, values=["1.1.1.1"], set_identifier="m1").status_code == 201


def test_alias_records(client, zone):
    alias = {"target": "d111.cloudfront.net", "target_type": "cloudfront", "evaluate_target_health": False}
    ok = rec(client, zone, type="A", name="cdn", alias=alias, ttl=None)
    assert ok.status_code == 201 and ok.json()["alias"]["hosted_zone_id"] == "Z2FDTNDATAQYW2" and ok.json()["ttl"] is None
    assert rec(client, zone, type="TXT", name="cdn2", alias=alias).status_code == 422
    assert rec(client, zone, type="A", name="cdn3", alias=alias, values=["1.1.1.1"]).status_code == 422
    same_zone = {"target": "cdn", "target_type": "record"}
    assert rec(client, zone, type="A", name="alias2", alias=same_zone).status_code == 201
    assert rec(client, zone, type="A", name="alias3", alias={"target": "missing", "target_type": "record"}).status_code == 422


def test_record_search_filter_sort_pagination(client, zone):
    for i in range(12):
        rec(client, zone, type="A", name=f"host{i:02d}", values=[f"10.0.0.{i}"], ttl=60 + i)
    rec(client, zone, type="TXT", name="notes", values=["hello"])
    rec(client, zone, type="A", name="cdn", alias={"target": "x.cloudfront.net", "target_type": "cloudfront"})
    base = f"/api/hosted-zones/{zone['zone_id']}/records"
    first = client.get(f"{base}?page_size=5").json()
    assert first["total"] == 16 and first["pages"] == 4
    assert first["items"][0]["name"] == "example.com."  # apex first
    assert client.get(f"{base}?page=4&page_size=5").json()["items"][0]["name"] == "notes.example.com."
    assert client.get(f"{base}?q=host0").json()["total"] == 10
    assert client.get(f"{base}?q=10.0.0.7").json()["items"][0]["name"] == "host07.example.com."
    assert client.get(f"{base}?type=txt").json()["total"] == 1
    assert client.get(f"{base}?alias=true").json()["total"] == 1
    assert client.get(f"{base}?type=A&q=host&page_size=3&page=2").json()["items"][0]["name"] == "host03.example.com."
    by_ttl = client.get(f"{base}?type=A&sort=ttl&order=desc&page_size=1").json()["items"][0]
    assert by_ttl["ttl"] == 71
    assert client.get(f"{base}?routing_policy=weighted").json()["total"] == 0


def test_bulk_delete(client, zone):
    ids = [rec(client, zone, type="A", name=f"b{i}", values=["1.1.1.1"]).json()["id"] for i in range(3)]
    system = next(r["id"] for r in client.get(f"/api/hosted-zones/{zone['zone_id']}/records").json()["items"] if r["type"] == "SOA")
    res = client.post(f"/api/hosted-zones/{zone['zone_id']}/records/bulk-delete", json={"ids": [*ids, system, 99999]}).json()
    assert res["deleted"] == 3 and len(res["skipped"]) == 2
    assert client.get(f"/api/hosted-zones/{zone['zone_id']}").json()["record_count"] == 2


def test_bulk_ttl_update(client, zone):
    zid = zone["zone_id"]
    ids = [rec(client, zone, type="A", name=f"t{i}", values=["1.1.1.1"]).json()["id"] for i in range(3)]
    alias = rec(client, zone, type="A", name="cdn", alias={"target": "x.cloudfront.net", "target_type": "cloudfront"}, ttl=None).json()["id"]
    res = client.post(f"/api/hosted-zones/{zid}/records/bulk-ttl", json={"ids": [*ids, alias, 99999], "ttl": 900}).json()
    assert res["updated"] == 3 and len(res["skipped"]) == 2
    assert {client.get(f"/api/records/{i}").json()["ttl"] for i in ids} == {900}
    bad = client.post(f"/api/hosted-zones/{zid}/records/bulk-ttl", json={"ids": ids, "ttl": -5})
    assert bad.status_code == 422 and bad.json()["errors"][0]["field"] == "ttl"
    assert {client.get(f"/api/records/{i}").json()["ttl"] for i in ids} == {900}
