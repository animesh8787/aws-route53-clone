from tests.conftest import make_record

HC = {"name": "my-check", "type": "HTTPS", "endpoint": "example.com", "port": 443, "path": "/health"}


def test_health_check_crud_and_validation(client):
    created = client.post("/api/health-checks", json=HC)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["health_check_id"].startswith("hc-") and body["status"] == "HEALTHY" and body["record_count"] == 0

    assert client.post("/api/health-checks", json=HC).status_code == 409  # duplicate name
    bad = client.post("/api/health-checks", json={**HC, "name": "other", "endpoint": "not a host", "port": 70000})
    assert bad.status_code == 422 and {e["field"] for e in bad.json()["errors"]} == {"endpoint", "port"}
    assert client.post("/api/health-checks", json={**HC, "name": "s", "type": "HTTP_STR_MATCH"}).status_code == 422
    tcp = client.post("/api/health-checks", json={"name": "t", "type": "TCP", "endpoint": "192.0.2.5", "port": 22, "path": "/ignored"})
    assert tcp.status_code == 201 and tcp.json()["path"] == ""

    hid = body["health_check_id"]
    upd = client.put(f"/api/health-checks/{hid}", json={**HC, "port": 8443, "request_interval": 10})
    assert upd.json()["port"] == 8443 and upd.json()["request_interval"] == 10
    assert client.get(f"/api/health-checks/{hid}").json()["name"] == "my-check"


def test_health_check_status_history_search_and_delete_detaches_records(client, zone):
    hid = client.post("/api/health-checks", json=HC).json()["health_check_id"]
    rec = make_record(client, zone["zone_id"], type="A", name="w", values=["1.1.1.1"], health_check_id=hid).json()
    assert client.get(f"/api/health-checks/{hid}").json()["record_count"] == 1
    assert client.get(f"/api/health-checks/{hid}/records").json()[0]["name"] == "w.example.com."

    flipped = client.patch(f"/api/health-checks/{hid}/status", json={"status": "UNHEALTHY", "note": "maintenance"}).json()
    assert flipped["status"] == "UNHEALTHY" and flipped["history"][0]["note"] == "maintenance" and len(flipped["history"]) == 2

    assert client.get("/api/health-checks?q=my-check").json()["total"] == 1
    assert client.get("/api/health-checks?status=unhealthy").json()["total"] >= 1
    assert client.get("/api/health-checks?type=HTTP_STR_MATCH").json()["total"] == 0

    deleted = client.delete(f"/api/health-checks/{hid}").json()
    assert deleted["detached_records"] == 1
    assert client.get(f"/api/records/{rec['id']}").json()["health_check_id"] is None
    assert client.get(f"/api/health-checks/{hid}").status_code == 404


def test_notifications_are_recorded_for_health_checks(client):
    client.post("/api/health-checks", json=HC)
    from app.db.session import SessionLocal
    from app.models import ActivityEvent

    with SessionLocal() as db:
        events = db.query(ActivityEvent).all()
    assert any(e.resource_type == "Health check" and e.action == "created" for e in events)


PROFILE = {"name": "prod-profile", "description": "Production DNS settings", "vpc_ids": ["vpc-0a1b2c3d4e5f60789"]}


def test_profile_crud_search_filter_pagination(client):
    created = client.post("/api/resources/profile", json=PROFILE)
    assert created.status_code == 201, created.text
    pid = created.json()["id"]
    assert pid.startswith("rp-") and created.json()["status"] == "COMPLETE" and created.json()["vpc_ids"] == PROFILE["vpc_ids"]

    assert client.post("/api/resources/profile", json=PROFILE).status_code == 409
    clash = client.post("/api/resources/profile", json={"name": "second", "vpc_ids": ["vpc-0a1b2c3d4e5f60789"]})
    assert clash.status_code == 409 and "already associated" in clash.json()["detail"]
    assert client.post("/api/resources/profile", json={"name": "!!bad", "vpc_ids": []}).status_code == 422
    unknown = client.post("/api/resources/profile", json={"name": "x", "vpc_ids": ["vpc-nope"]})
    assert unknown.status_code == 422 and unknown.json()["errors"][0]["field"] == "vpc_ids"

    for n in range(11):
        assert client.post("/api/resources/profile", json={"name": f"extra-{n:02d}"}).status_code == 201
    page = client.get("/api/resources/profile?page_size=5&page=3").json()
    assert page["total"] == 12 and page["pages"] == 3 and len(page["items"]) == 2
    assert client.get("/api/resources/profile?q=production").json()["total"] == 1
    assert client.get("/api/resources/profile?sort=name&order=desc&page_size=1").json()["items"][0]["name"] == "prod-profile"

    upd = client.put(f"/api/resources/profile/{pid}", json={**PROFILE, "description": "changed", "vpc_ids": []})
    assert upd.json()["description"] == "changed" and upd.json()["vpc_ids"] == []
    assert client.delete(f"/api/resources/profile/{pid}").status_code == 200
    assert client.get(f"/api/resources/profile/{pid}").status_code == 404
    assert client.get("/api/resources/nonsense").status_code == 404


def test_profile_zone_association_requires_private_zone(client, zone):
    res = client.post("/api/resources/profile", json={"name": "z", "zone_ids": [zone["zone_id"]]})
    assert res.status_code == 422 and "private hosted zone" in res.json()["detail"]
    private = client.post("/api/hosted-zones", json={"name": "corp.internal", "type": "private", "vpc": {"vpc_id": "vpc-0a1b2c3d4e5f60789", "region": "us-east-1"}}).json()
    assert client.post("/api/resources/profile", json={"name": "z", "zone_ids": [private["zone_id"]]}).status_code == 201
