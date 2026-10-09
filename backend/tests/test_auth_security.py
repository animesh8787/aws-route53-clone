from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.main import app
from app.models import User
from tests.conftest import CSRF, STRONG_PASSWORD, make_record


def register(c, email="new.user@example.org", password=STRONG_PASSWORD, name="New User"):
    return c.post("/api/auth/register", json={"email": email, "password": password, "display_name": name})


def test_register_validation(anon):
    weak = register(anon, password="short1")
    assert weak.status_code == 422 and weak.json()["errors"][0]["field"] == "password"
    assert register(anon, password="onlyletterslongenough").status_code == 422  # no digit
    assert register(anon, password="password123").status_code == 422  # too common
    assert register(anon, email="jane.doe@example.org", password="jane.doe-2024!").status_code == 422  # contains the e-mail name
    assert register(anon, password="x" * 80 + "1").status_code == 422  # beyond bcrypt's 72 bytes
    bad_email = register(anon, email="not-an-email")
    assert bad_email.status_code == 422 and bad_email.json()["errors"][0]["field"] == "email"
    assert register(anon, name="n" * 51).status_code == 422


def test_register_signs_in_and_creates_an_isolated_account(anon):
    res = register(anon, email="Mixed.Case@Example.org")
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["email"] == "mixed.case@example.org" and len(body["account_id"]) == 12 and body["account_id"] != "123456789012"
    assert "httponly" in res.headers["set-cookie"].lower()
    assert anon.get("/api/auth/me").json()["email"] == "mixed.case@example.org"
    assert anon.get("/api/hosted-zones").json()["total"] == 0  # a new account starts empty
    assert anon.get("/api/health-checks").json()["total"] == 0
    duplicate = register(anon, email="MIXED.case@example.org")
    assert duplicate.status_code == 409


def test_sign_in_errors_are_generic_and_accounts_lock(anon):
    settings = get_settings()
    unknown = anon.post("/api/auth/login", json={"email": "nobody@example.org", "password": "whatever-123"})
    wrong = anon.post("/api/auth/login", json={"email": settings.demo_email, "password": "wrong-password-1"})
    assert unknown.status_code == wrong.status_code == 401 and unknown.json()["detail"] == wrong.json()["detail"]

    for _ in range(settings.max_failed_logins - 2):  # one failure was already counted above
        assert anon.post("/api/auth/login", json={"email": settings.demo_email, "password": "wrong-password-1"}).status_code == 401
    locked = anon.post("/api/auth/login", json={"email": settings.demo_email, "password": "wrong-password-1"})
    assert locked.status_code == 401  # the failure that triggers the lock still looks like a normal failure
    blocked = anon.post("/api/auth/login", json={"email": settings.demo_email, "password": settings.demo_password})
    assert blocked.status_code == 429 and "Try again in" in blocked.json()["detail"]

    with SessionLocal() as db:  # time passes
        user = db.query(User).filter_by(email=settings.demo_email).one()
        user.locked_until = datetime.utcnow() - timedelta(seconds=1)
        db.commit()
    assert anon.post("/api/auth/login", json={"email": settings.demo_email, "password": settings.demo_password}).status_code == 200
    with SessionLocal() as db:
        assert db.query(User).filter_by(email=settings.demo_email).one().failed_logins == 0


def test_successful_login_resets_failed_attempts(anon):
    settings = get_settings()
    for _ in range(settings.max_failed_logins - 1):
        anon.post("/api/auth/login", json={"email": settings.demo_email, "password": "wrong-password-1"})
    assert anon.post("/api/auth/login", json={"email": settings.demo_email, "password": settings.demo_password}).status_code == 200
    for _ in range(settings.max_failed_logins - 1):
        anon.post("/api/auth/login", json={"email": settings.demo_email, "password": "wrong-password-1"})
    assert anon.post("/api/auth/login", json={"email": settings.demo_email, "password": settings.demo_password}).status_code == 200


def test_registration_rate_limit_and_switch(anon, monkeypatch):
    for i in range(20):
        assert register(anon, email=f"user{i}.person@example.org").status_code == 201
    limited = register(anon, email="one.more@example.org")
    assert limited.status_code == 429
    monkeypatch.setattr(get_settings(), "allow_registration", False)
    assert anon.get("/api/auth/config").json()["registration_enabled"] is False
    from app.core.ratelimit import register_limiter

    register_limiter.reset()
    assert register(anon, email="closed@example.org").status_code == 400


def test_state_changing_requests_need_the_csrf_header(db_ready):
    with TestClient(app) as raw:  # a client that does not send the custom header (like a forged cross-site form)
        res = raw.post("/api/auth/login", json={"email": "demo@example.com", "password": "password"})
        assert res.status_code == 403 and "blocked" in res.json()["detail"]
        assert raw.get("/api/health").status_code == 200
    with TestClient(app, headers=CSRF) as ok:
        assert ok.post("/api/auth/login", json={"email": "demo@example.com", "password": "password"}).status_code == 200
        raw_delete = ok.delete("/api/hosted-zones/ZNOPE", headers={"X-Requested-With": ""})
        assert raw_delete.status_code == 403


def test_security_headers(client):
    res = client.get("/api/auth/me")
    assert res.headers["x-content-type-options"] == "nosniff" and res.headers["x-frame-options"] == "DENY"
    assert "no-store" in res.headers["cache-control"]
    assert res.headers["referrer-policy"]


def test_change_password_signs_out_other_sessions(db_ready):
    settings = get_settings()
    login = {"email": settings.demo_email, "password": settings.demo_password}
    with TestClient(app, headers=CSRF) as first, TestClient(app, headers=CSRF) as second:
        assert first.post("/api/auth/login", json=login).status_code == 200
        assert second.post("/api/auth/login", json=login).status_code == 200
        assert first.post("/api/auth/change-password", json={"current_password": "nope", "new_password": STRONG_PASSWORD}).status_code == 422
        assert first.post("/api/auth/change-password", json={"current_password": settings.demo_password, "new_password": "weak"}).status_code == 422
        same = first.post("/api/auth/change-password", json={"current_password": settings.demo_password, "new_password": settings.demo_password})
        assert same.status_code == 422
        ok = first.post("/api/auth/change-password", json={"current_password": settings.demo_password, "new_password": STRONG_PASSWORD})
        assert ok.status_code == 200, ok.text
        assert first.get("/api/auth/me").status_code == 200  # this session survives
        assert second.get("/api/auth/me").status_code == 401  # the other one was signed out
        assert first.post("/api/auth/logout").status_code == 200
        assert first.post("/api/auth/login", json=login).status_code == 401
        assert first.post("/api/auth/login", json={**login, "password": STRONG_PASSWORD}).status_code == 200


def test_sessions_list_and_revoke(db_ready):
    settings = get_settings()
    login = {"email": settings.demo_email, "password": settings.demo_password}
    with TestClient(app, headers=CSRF) as a, TestClient(app, headers=CSRF) as b, TestClient(app, headers=CSRF) as c:
        for client in (a, b, c):
            assert client.post("/api/auth/login", json=login, headers={"User-Agent": "TestBrowser/1.0"}).status_code == 200
        sessions = a.get("/api/auth/sessions").json()
        assert len(sessions) == 3 and sum(s["is_current"] for s in sessions) == 1 and sessions[0]["user_agent"] == "TestBrowser/1.0"
        other = next(s for s in sessions if not s["is_current"])
        assert a.delete(f"/api/auth/sessions/{other['id']}").status_code == 200
        assert len(a.get("/api/auth/sessions").json()) == 2
        assert a.post("/api/auth/sessions/revoke-others").json()["detail"].startswith("Signed out of 1")
        assert len(a.get("/api/auth/sessions").json()) == 1
        assert a.delete("/api/auth/sessions/999999").status_code == 400


def test_data_is_isolated_between_accounts(client, other_client, zone):
    zid = zone["zone_id"]
    rec = make_record(client, zid, type="A", name="www", values=["1.1.1.1"]).json()
    hc = client.get("/api/health-checks").json()["items"][0]["health_check_id"]
    profile = client.post("/api/resources/profile", json={"name": "mine"}).json()

    assert other_client.get("/api/hosted-zones").json()["total"] == 0
    assert other_client.get(f"/api/hosted-zones/{zid}").status_code == 404
    assert other_client.get(f"/api/hosted-zones/{zone['id']}").status_code == 404  # numeric ids are scoped too
    assert other_client.put(f"/api/hosted-zones/{zid}", json={"comment": "hijack"}).status_code == 404
    assert other_client.delete(f"/api/hosted-zones/{zid}?force=true").status_code == 404
    assert other_client.get(f"/api/hosted-zones/{zid}/records").status_code == 404
    assert other_client.post(f"/api/hosted-zones/{zid}/records", json={"type": "A", "name": "x", "ttl": 60, "values": ["9.9.9.9"]}).status_code == 404
    assert other_client.get(f"/api/records/{rec['id']}").status_code == 404
    assert other_client.put(f"/api/records/{rec['id']}", json={"type": "A", "name": "www", "ttl": 60, "values": ["9.9.9.9"]}).status_code == 404
    assert other_client.delete(f"/api/records/{rec['id']}").status_code == 404
    assert other_client.get(f"/api/hosted-zones/{zid}/export").status_code == 404
    assert other_client.post(f"/api/hosted-zones/{zid}/import", json={"content": "a 300 IN A 1.1.1.1"}).status_code == 404
    assert other_client.get(f"/api/hosted-zones/{zid}/tags").status_code == 404
    assert other_client.get(f"/api/hosted-zones/{zid}/dnssec").status_code == 404
    assert other_client.get(f"/api/health-checks/{hc}").status_code == 404
    assert other_client.get(f"/api/resources/profile/{profile['id']}").status_code == 404
    assert other_client.delete(f"/api/resources/profile/{profile['id']}").status_code == 404
    assert other_client.get("/api/resources/profile").json()["total"] == 0

    # queries are answered from the caller's own zones only
    assert client.get("/api/dns/resolve", params={"name": "www.example.com"}).json()["answers"][0]["value"] == "1.1.1.1"
    assert other_client.get("/api/dns/resolve", params={"name": "www.example.com"}).json()["rcode"] == "REFUSED"
    assert other_client.get("/api/dashboard/summary").json()["hosted_zones"] == 0
    assert other_client.get("/api/billing/estimate").json()["total"] == 0
    assert other_client.get("/api/activity/summary").json()["total"] >= 1  # only its own "account created" event

    # both accounts can own a zone with the same name, and own records do not clash
    mine = other_client.post("/api/hosted-zones", json={"name": "example.com"})
    assert mine.status_code == 201 and mine.json()["zone_id"] != zid
    assert make_record(other_client, mine.json()["zone_id"], type="A", name="www", values=["2.2.2.2"]).status_code == 201
    assert other_client.get("/api/dns/resolve", params={"name": "www.example.com"}).json()["answers"][0]["value"] == "2.2.2.2"
    assert client.get("/api/dns/resolve", params={"name": "www.example.com"}).json()["answers"][0]["value"] == "1.1.1.1"


def test_cross_account_references_are_rejected(client, other_client, zone):
    other_zone = other_client.post("/api/hosted-zones", json={"name": "theirs.org"}).json()
    hc_id = other_client.post("/api/health-checks", json={"name": "h", "type": "TCP", "endpoint": "192.0.2.1", "port": 22}).json()["health_check_id"]
    other_cidr = other_client.post("/api/resources/cidr_collection", json={"name": "c", "locations": [{"name": "a", "cidr_blocks": ["10.0.0.0/24"]}]}).json()["id"]
    assert make_record(client, zone["zone_id"], type="A", name="w", values=["1.1.1.1"], health_check_id=hc_id).status_code == 422
    ip_based = make_record(client, zone["zone_id"], type="A", name="ip", values=["1.1.1.1"], routing_policy="ipbased", set_identifier="a", cidr_collection_id=other_cidr, cidr_location="a")
    assert ip_based.status_code == 422
    policy = {"RecordType": "A", "StartEndpoint": "a", "Endpoints": {"a": {"Type": "value", "Value": "192.0.2.1"}}}
    pid = client.post("/api/resources/traffic_policy", json={"name": "p", "record_type": "A", "document": policy}).json()["id"]
    foreign = client.post("/api/resources/policy_record", json={"zone_id": other_zone["zone_id"], "dns_name": "x", "policy_id": pid, "policy_version": 1, "ttl": 60})
    assert foreign.status_code == 422


def test_sample_data_and_clearing(client, other_client):
    summary = other_client.get("/api/account/summary").json()
    assert summary["empty"] is True and summary["zones"] == 0
    assert other_client.get("/api/hosted-zones").json()["total"] == 0

    loaded = other_client.post("/api/account/sample-data")
    assert loaded.status_code == 201, loaded.text
    zones = other_client.get("/api/hosted-zones?page_size=100").json()
    assert zones["total"] == 22 and other_client.get("/api/health-checks").json()["total"] == 3
    assert other_client.get("/api/resources/traffic_policy").json()["total"] >= 2
    assert other_client.post("/api/account/sample-data").status_code == 409  # not empty any more
    example = next(z for z in zones["items"] if z["name"] == "example.com")
    assert example["zone_id"] != "Z04512872OH7L5Q4YLRPT" and example["record_count"] >= 30
    assert other_client.get("/api/dns/resolve", params={"name": "www.example.com"}).json()["rcode"] == "NOERROR"
    assert other_client.get("/api/dashboard/summary").json()["hosted_zones"] == 22

    # the demo account is unaffected, and it can still be filled independently
    assert client.get("/api/hosted-zones").json()["total"] == 0
    assert client.post("/api/account/sample-data").status_code == 409  # the fixture gave this account health checks
    assert client.post("/api/account/clear-data").status_code == 200
    assert client.post("/api/account/sample-data").status_code == 201
    assert client.get("/api/hosted-zones").json()["total"] == 22
    assert client.get("/api/health-checks").json()["total"] == 3

    assert other_client.post("/api/account/clear-data").status_code == 200
    assert other_client.get("/api/account/summary").json()["empty"] is True
    assert client.get("/api/hosted-zones").json()["total"] == 22


def test_profile_update_and_account_deletion(other_client, anon):
    renamed = other_client.patch("/api/auth/me", json={"display_name": "  New Name "})
    assert renamed.status_code == 200 and renamed.json()["display_name"] == "New Name"
    assert other_client.patch("/api/auth/me", json={"display_name": ""}).status_code == 422
    other_client.post("/api/hosted-zones", json={"name": "gone.org"})
    wrong = other_client.request("DELETE", "/api/auth/me", json={"password": "not-the-password-1"})
    assert wrong.status_code == 422
    gone = other_client.request("DELETE", "/api/auth/me", json={"password": STRONG_PASSWORD})
    assert gone.status_code == 200
    assert other_client.get("/api/auth/me").status_code == 401
    assert anon.post("/api/auth/login", json={"email": "other.person@example.org", "password": STRONG_PASSWORD}).status_code == 401
    with SessionLocal() as db:
        from app.models import HostedZone

        assert db.query(HostedZone).count() == 0  # the account's data went with it
