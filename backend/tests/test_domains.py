from datetime import datetime, timedelta

CONTACT = {
    "first_name": "Ada", "last_name": "Lovelace", "email": "ada@example.org", "phone": "+44 20 7946 0000",
    "address_line": "1 Analytical St", "city": "London", "country": "GB", "zip_code": "N1 1AA",
}  # fmt: skip


def available_name(client, label="mysite"):
    results = client.get("/api/domains/availability", params={"name": label}).json()
    return next(r for r in results if r["available"])["name"]


def register_payload(name, **over):
    return {"name": name, "years": 2, "auto_renew": True, "transfer_lock": True, "privacy_protection": True, "contact": CONTACT, **over}


def test_availability_is_deterministic_and_priced(client):
    first = client.get("/api/domains/availability", params={"name": "brandnewidea"}).json()
    again = client.get("/api/domains/availability", params={"name": "brandnewidea.com"}).json()
    assert [r["name"] for r in first][0] == "brandnewidea.com" == again[0]["name"]
    assert {r["name"] for r in first} >= {"brandnewidea.com", "brandnewidea.io", "brandnewidea.dev"}
    assert all(r["price"] for r in first if r["available"])
    google = client.get("/api/domains/availability", params={"name": "google.com"}).json()[0]
    assert google["available"] is False and "someone else" in google["reason"]
    assert client.get("/api/domains/availability", params={"name": "bad name!"}).status_code == 422
    unsupported = client.get("/api/domains/availability", params={"name": "thing.museum"}).json()[0]
    assert unsupported["available"] is False and "not supported" in unsupported["reason"]


def test_register_domain_creates_zone_and_request(client):
    name = available_name(client)
    created = client.post("/api/resources/domain", json=register_payload(name))
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["id"].startswith("dom-") and body["status"] == "ACTIVE" and body["transfer_lock"] is True
    assert datetime.fromisoformat(body["expires_at"]) > datetime.utcnow() + timedelta(days=700)
    assert 700 <= body["days_to_expiry"] <= 732 and body["expiring_soon"] is False

    zone = client.get(f"/api/hosted-zones/{body['zone_id']}").json()
    assert zone["name"] == name and zone["type"] == "public"
    assert body["name_servers"] == zone["name_servers"]

    requests = client.get("/api/resources/domain_request").json()
    assert requests["total"] == 1 and requests["items"][0]["request_type"] == "REGISTER_DOMAIN"
    assert requests["items"][0]["status"] == "IN_PROGRESS" and requests["items"][0]["price"] > 0

    assert client.post("/api/resources/domain", json=register_payload(name)).status_code == 422  # already yours


def test_register_validation(client):
    name = available_name(client)
    bad_contact = client.post("/api/resources/domain", json=register_payload(name, contact={**CONTACT, "email": "nope", "phone": "x"}))
    assert bad_contact.status_code == 422
    assert {e["field"] for e in bad_contact.json()["errors"]} == {"contact.email", "contact.phone"}
    assert client.post("/api/resources/domain", json=register_payload(name, years=11)).status_code == 422
    assert client.post("/api/resources/domain", json=register_payload("google.com")).status_code == 422
    assert client.post("/api/resources/domain", json=register_payload("a.museum")).status_code == 422


def test_edit_renew_transfer_and_no_delete(client):
    name = available_name(client, "managed")
    dom = client.post("/api/resources/domain", json=register_payload(name)).json()
    did = dom["id"]

    upd = client.put(f"/api/resources/domain/{did}", json={**register_payload(name, years=1), "auto_renew": False, "transfer_lock": False, "name_servers": ["ns1.dns.example.", "ns2.dns.example"]})
    assert upd.status_code == 200, upd.text
    assert upd.json()["auto_renew"] is False and upd.json()["name_servers"] == ["ns1.dns.example.", "ns2.dns.example."]
    assert upd.json()["expires_at"] == dom["expires_at"] and upd.json()["contact"]["first_name"] == "Ada"  # immutable parts stay
    assert client.put(f"/api/resources/domain/{did}", json={**register_payload(name), "name_servers": ["only-one.example"]}).status_code == 422

    renewed = client.post(f"/api/domains/{did}/renew", json={"years": 3}).json()
    assert datetime.fromisoformat(renewed["expires_at"]) > datetime.fromisoformat(dom["expires_at"]) + timedelta(days=1000)
    assert client.post(f"/api/domains/{did}/renew", json={"years": 11}).status_code == 422
    assert client.post(f"/api/domains/{did}/renew", json={"years": 9}).status_code == 409  # more than ten years in total

    assert client.put(f"/api/resources/domain/{did}", json={**register_payload(name), "transfer_lock": True}).status_code == 200
    assert client.post(f"/api/domains/{did}/transfer-out").status_code == 409
    client.put(f"/api/resources/domain/{did}", json={**register_payload(name), "transfer_lock": False})
    code = client.post(f"/api/domains/{did}/transfer-out").json()["auth_code"]
    assert len(code) >= 12

    assert client.delete(f"/api/resources/domain/{did}").status_code == 409
    types = [r["request_type"] for r in client.get("/api/resources/domain_request?sort=created_at&order=asc").json()["items"]]
    assert types[0] == "REGISTER_DOMAIN" and "RENEW_DOMAIN" in types and "TRANSFER_OUT" in types and "UPDATE_DOMAIN" in types


def test_requests_settle_over_time_and_are_read_only(client):
    from app.db.session import SessionLocal
    from app.models import Resource

    name = available_name(client, "settle")
    client.post("/api/resources/domain", json=register_payload(name))
    with SessionLocal() as db:
        req = db.query(Resource).filter(Resource.kind == "domain_request").one()
        req.data = {**req.data, "submitted_at": (datetime.utcnow() - timedelta(seconds=60)).isoformat(timespec="seconds")}
        db.commit()
    listing = client.get("/api/resources/domain_request?status=SUCCESSFUL").json()
    assert listing["total"] == 1
    assert client.delete(f"/api/resources/domain_request/{listing['items'][0]['id']}").status_code == 409
