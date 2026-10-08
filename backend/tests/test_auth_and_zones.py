def test_login_logout_flow(anon):
    assert anon.get("/api/auth/me").status_code == 401
    bad = anon.post("/api/auth/login", json={"email": "demo@example.com", "password": "nope"})
    assert bad.status_code == 401 and "Incorrect" in bad.json()["detail"]
    ok = anon.post("/api/auth/login", json={"email": "demo@example.com", "password": "password"})
    assert ok.status_code == 200
    assert "httponly" in ok.headers["set-cookie"].lower()
    assert anon.get("/api/auth/me").json()["email"] == "demo@example.com"
    anon.post("/api/auth/logout")
    assert anon.get("/api/auth/me").status_code == 401


def test_endpoints_require_auth(anon):
    assert anon.get("/api/hosted-zones").status_code == 401
    assert anon.get("/api/records/1").status_code == 401


def test_create_zone_adds_soa_and_ns(client, zone):
    assert zone["name"] == "example.com" and zone["record_count"] == 2
    assert len(zone["name_servers"]) == 4
    recs = client.get(f"/api/hosted-zones/{zone['zone_id']}/records").json()["items"]
    assert {r["type"] for r in recs} == {"NS", "SOA"}
    assert all(r["is_system"] for r in recs)
    ns = next(r for r in recs if r["type"] == "NS")
    assert ns["values"] == zone["name_servers"]


def test_zone_name_normalisation_duplicates_and_validation(client, zone):
    dup = client.post("/api/hosted-zones", json={"name": "EXAMPLE.com."})
    assert dup.status_code == 409
    bad = client.post("/api/hosted-zones", json={"name": "not a domain"})
    assert bad.status_code == 422 and bad.json()["errors"][0]["field"] == "name"
    assert client.post("/api/hosted-zones", json={"name": "localhost"}).status_code == 422
    priv = client.post("/api/hosted-zones", json={"name": "example.com", "type": "private"})
    assert priv.status_code == 422  # needs a VPC
    priv = client.post("/api/hosted-zones", json={"name": "example.com", "type": "private", "vpc": {"vpc_id": "vpc-1", "region": "us-east-1"}})
    assert priv.status_code == 201 and priv.json()["vpcs"][0]["vpc_id"] == "vpc-1"


def test_update_and_delete_zone(client, zone):
    res = client.put(f"/api/hosted-zones/{zone['zone_id']}", json={"comment": "updated"})
    assert res.json()["comment"] == "updated"
    assert client.get(f"/api/hosted-zones/{zone['id']}").status_code == 200  # numeric id also works
    client.post(f"/api/hosted-zones/{zone['zone_id']}/records", json={"type": "A", "name": "www", "ttl": 60, "values": ["1.2.3.4"]})
    blocked = client.delete(f"/api/hosted-zones/{zone['zone_id']}")
    assert blocked.status_code == 409
    assert client.delete(f"/api/hosted-zones/{zone['zone_id']}?force=true").status_code == 200
    assert client.get(f"/api/hosted-zones/{zone['zone_id']}").status_code == 404


def test_zone_search_filter_sort_pagination(client):
    for name in ["alpha.com", "beta.com", "gamma.org", "delta.net", "epsilon.io"]:
        client.post("/api/hosted-zones", json={"name": name, "comment": f"zone {name}"})
    client.post("/api/hosted-zones", json={"name": "priv.local", "type": "private", "vpc": {"vpc_id": "vpc-9", "region": "us-east-1"}})
    page1 = client.get("/api/hosted-zones?page=1&page_size=2").json()
    assert page1["total"] == 6 and page1["pages"] == 3 and len(page1["items"]) == 2
    assert [z["name"] for z in page1["items"]] == ["alpha.com", "beta.com"]
    page3 = client.get("/api/hosted-zones?page=3&page_size=2").json()
    assert [z["name"] for z in page3["items"]] == ["gamma.org", "priv.local"]
    assert client.get("/api/hosted-zones?q=.com").json()["total"] == 2
    assert client.get("/api/hosted-zones?type=private").json()["total"] == 1
    assert client.get("/api/hosted-zones?q=ta&type=public").json()["total"] == 2  # beta, delta
    desc = client.get("/api/hosted-zones?sort=name&order=desc&page_size=1").json()
    assert desc["items"][0]["name"] == "priv.local"
