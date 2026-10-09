import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_route53.db")
os.environ["SEED_ON_START"] = "false"

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.ratelimit import login_limiter, register_limiter
from app.db.session import Base, SessionLocal, engine
from app.main import app
from app.seed import ensure_user, seed_health_checks

CSRF = {"X-Requested-With": "fetch"}  # what the browser client sends on every request
STRONG_PASSWORD = "Correct-horse-42"


@pytest.fixture()
def empty_db():
    """Tables only: no users, no health checks."""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    login_limiter.reset()
    register_limiter.reset()
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture()
def db_ready(empty_db):
    with SessionLocal() as db:
        seed_health_checks(db, ensure_user(db).id)
    yield


@pytest.fixture()
def anon(db_ready):
    with TestClient(app, headers=CSRF) as c:
        yield c


@pytest.fixture()
def client(anon):
    s = get_settings()
    res = anon.post("/api/auth/login", json={"email": s.demo_email, "password": s.demo_password})
    assert res.status_code == 200, res.text
    return anon


@pytest.fixture()
def other_client(db_ready):
    """A second, independent browser session signed in as a different, freshly registered user."""
    with TestClient(app, headers=CSRF) as c:
        res = c.post("/api/auth/register", json={"email": "other.person@example.org", "password": STRONG_PASSWORD, "display_name": "Other"})
        assert res.status_code == 201, res.text
        yield c


@pytest.fixture()
def zone(client):
    res = client.post("/api/hosted-zones", json={"name": "example.com", "comment": "test"})
    assert res.status_code == 201, res.text
    return res.json()


def make_record(client, zone_id, **payload):
    payload.setdefault("ttl", 300)
    return client.post(f"/api/hosted-zones/{zone_id}/records", json=payload)
