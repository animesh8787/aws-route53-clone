from collections import Counter

from tests.conftest import make_record

ZONE_FILE = """\
$ORIGIN example.com.
$TTL 1h
@   IN SOA ns1.example.com. admin.example.com. (
        2024010101 ; serial
        7200 900 1209600 86400 )
@       IN NS   ns1.example.com.
@       IN A    192.0.2.1
www     300 IN CNAME @
mail    IN A    192.0.2.25 ; mail host
@       IN MX   10 mail
        IN MX   20 backup.example.net.
@       IN TXT  "v=spf1 mx" "-all"
_sip._tcp IN SRV 10 5 5060 sip
@       IN CAA  0 issue "letsencrypt.org"
"""


def test_bind_import_preview_then_confirm(client, zone):
    zid = zone["zone_id"]
    preview = client.post(f"/api/hosted-zones/{zid}/import", json={"content": ZONE_FILE, "dry_run": True}).json()
    assert preview["dry_run"] and not preview["committed"] and preview["errors"] == 0
    assert preview["skipped"] == 2  # SOA + apex NS
    by_name = {(i["name"], i["type"]): i for i in preview["items"]}
    assert by_name[("example.com.", "MX")]["values"] == ["10 mail.example.com.", "20 backup.example.net."]
    assert by_name[("www.example.com.", "CNAME")]["ttl"] == 300
    assert by_name[("mail.example.com.", "A")]["ttl"] == 3600  # $TTL 1h
    assert client.get(f"/api/hosted-zones/{zid}").json()["record_count"] == 2  # nothing saved

    done = client.post(f"/api/hosted-zones/{zid}/import", json={"content": ZONE_FILE, "dry_run": False}).json()
    assert done["committed"] and done["created"] == 7
    assert client.get(f"/api/hosted-zones/{zid}").json()["record_count"] == 9
    txt = client.get(f"/api/hosted-zones/{zid}/records?type=TXT").json()["items"][0]
    assert txt["values"] == ['"v=spf1 mx" "-all"']


def test_bind_import_errors_are_reported_and_atomic(client, zone):
    zid = zone["zone_id"]
    content = "www 300 IN A 192.0.2.1\nbad 300 IN A 999.0.0.1\nx 300 IN HINFO a b\nwww2 300 IN A 192.0.2.2\n"
    res = client.post(f"/api/hosted-zones/{zid}/import", json={"content": content, "dry_run": False}).json()
    assert res["errors"] == 2 and not res["committed"]
    assert client.get(f"/api/hosted-zones/{zid}").json()["record_count"] == 2
    partial = client.post(f"/api/hosted-zones/{zid}/import", json={"content": content, "dry_run": False, "skip_invalid": True}).json()
    assert partial["committed"] and partial["created"] == 2
    assert client.get(f"/api/hosted-zones/{zid}").json()["record_count"] == 4


def test_export_json_and_bind_round_trip(client, zone):
    zid = zone["zone_id"]
    make_record(client, zid, type="A", name="www", values=["1.1.1.1", "2.2.2.2"])
    make_record(client, zid, type="MX", name="@", values=["10 mail.example.com"])
    data = client.get(f"/api/hosted-zones/{zid}/export?format=json")
    assert "attachment" in data.headers["content-disposition"]
    assert len(data.json()["records"]) == 4 and data.json()["hosted_zone"]["name"] == "example.com"
    bind = client.get(f"/api/hosted-zones/{zid}/export?format=bind").text
    assert "$ORIGIN example.com." in bind and "www\t300\tIN\tA\t1.1.1.1" in bind
    other = client.post("/api/hosted-zones", json={"name": "copy.org"}).json()
    res = client.post(f"/api/hosted-zones/{other['zone_id']}/import", json={"content": bind.replace("example.com", "copy.org"), "dry_run": False}).json()
    assert res["errors"] == 0 and res["created"] == 2


def test_import_rejects_oversized_input(client, zone):
    res = client.post(f"/api/hosted-zones/{zone['zone_id']}/import", json={"content": "a" * 1_100_000})
    assert res.status_code == 400


def test_resolve_simple_cname_alias_wildcard_and_rcodes(client, zone):
    zid = zone["zone_id"]
    make_record(client, zid, type="A", name="www", values=["1.1.1.1"])
    make_record(client, zid, type="CNAME", name="blog", values=["www.example.com"])
    make_record(client, zid, type="A", name="*.apps", values=["5.5.5.5"])
    make_record(client, zid, type="A", name="cdn", alias={"target": "d1.cloudfront.net", "target_type": "cloudfront"}, ttl=None)
    get = lambda n, t="A", **q: client.get("/api/dns/resolve", params={"name": n, "type": t, **q}).json()
    assert [a["value"] for a in get("www.example.com")["answers"]] == ["1.1.1.1"]
    chain = get("blog.example.com")
    assert [a["type"] for a in chain["answers"]] == ["CNAME", "A"] and chain["rcode"] == "NOERROR"
    assert get("x.apps.example.com")["answers"][0]["value"] == "5.5.5.5"
    assert get("nope.example.com")["rcode"] == "NXDOMAIN"
    assert get("www.example.com", "TXT") ["answers"] == []
    assert get("other.org")["rcode"] == "REFUSED"
    assert len(get("cdn.example.com")["answers"]) == 2  # simulated alias addresses


def test_resolve_weighted_failover_multivalue_latency_geo(client, zone):
    zid = zone["zone_id"]
    for ident, ip, w in [("a", "1.0.0.1", 90), ("b", "1.0.0.2", 10), ("off", "1.0.0.3", 0)]:
        make_record(client, zid, type="A", name="w", values=[ip], routing_policy="weighted", set_identifier=ident, weight=w)
    picks = Counter(client.get("/api/dns/resolve", params={"name": "w.example.com", "seed": s}).json()["answers"][0]["value"] for s in range(200))
    assert "1.0.0.3" not in picks and picks["1.0.0.1"] > picks["1.0.0.2"] * 3
    again = client.get("/api/dns/resolve", params={"name": "w.example.com", "seed": 7}).json()
    assert again == client.get("/api/dns/resolve", params={"name": "w.example.com", "seed": 7}).json()

    hc = "hc-0a1b2c3d4e5f6a7b8"
    make_record(client, zid, type="A", name="f", values=["2.0.0.1"], routing_policy="failover", set_identifier="p", failover="PRIMARY", health_check_id=hc)
    make_record(client, zid, type="A", name="f", values=["2.0.0.2"], routing_policy="failover", set_identifier="s", failover="SECONDARY")
    assert client.get("/api/dns/resolve", params={"name": "f.example.com"}).json()["answers"][0]["value"] == "2.0.0.1"
    assert client.patch(f"/api/health-checks/{hc}/status", json={"status": "UNHEALTHY"}).status_code == 200
    assert client.get("/api/dns/resolve", params={"name": "f.example.com"}).json()["answers"][0]["value"] == "2.0.0.2"

    for i in range(3):
        make_record(client, zid, type="A", name="m", values=[f"3.0.0.{i}"], routing_policy="multivalue", set_identifier=f"m{i}")
    assert len(client.get("/api/dns/resolve", params={"name": "m.example.com"}).json()["answers"]) == 3

    for region, ip in [("us-east-1", "4.0.0.1"), ("eu-west-1", "4.0.0.2")]:
        make_record(client, zid, type="A", name="l", values=[ip], routing_policy="latency", set_identifier=region, region=region)
    assert client.get("/api/dns/resolve", params={"name": "l.example.com", "client_region": "eu-central-1"}).json()["answers"][0]["value"] == "4.0.0.2"

    for ident, kw, ip in [("def", {"geo_country": "*"}, "6.0.0.1"), ("eu", {"geo_continent": "EU"}, "6.0.0.2"), ("de", {"geo_country": "DE"}, "6.0.0.3")]:
        make_record(client, zid, type="A", name="g", values=[ip], routing_policy="geolocation", set_identifier=ident, **kw)
    ask = lambda **q: client.get("/api/dns/resolve", params={"name": "g.example.com", **q}).json()["answers"][0]["value"]
    assert ask(client_country="DE") == "6.0.0.3"
    assert ask(client_continent="EU", client_country="FR") == "6.0.0.2"
    assert ask(client_country="BR") == "6.0.0.1"


def test_dashboard_and_health_checks(client, zone):
    summary = client.get("/api/dashboard/summary").json()
    assert summary["hosted_zones"] == 1 and summary["records"] == 2
    assert client.get("/api/health-checks").json()["total"] == 3
