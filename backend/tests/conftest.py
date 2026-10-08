import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_route53.db")
os.environ["SEED_ON_START"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.db.session import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import ensure_user, seed_health_checks  # noqa: E402


@pytest.fixture()
def db_ready():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        ensure_user(db)
        seed_health_checks(db)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture()
def anon(db_ready):
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def client(anon):
    s = get_settings()
    res = anon.post("/api/auth/login", json={"email": s.demo_email, "password": s.demo_password})
    assert res.status_code == 200, res.text
    return anon


@pytest.fixture()
def zone(client):
    res = client.post("/api/hosted-zones", json={"name": "example.com", "comment": "test"})
    assert res.status_code == 201, res.text
    return res.json()


def make_record(client, zone_id, **payload):
    payload.setdefault("ttl", 300)
    return client.post(f"/api/hosted-zones/{zone_id}/records", json=payload)
