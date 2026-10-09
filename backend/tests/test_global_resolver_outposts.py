GR = {"name": "branch-resolver", "description": "Anycast for branches", "regions": ["us-east-1", "eu-west-1"], "observability_region": "us-east-1", "ip_address_type": "DUALSTACK"}
OUTPOST = {"name": "plant-resolver", "outpost_arn": "arn:aws:outposts:eu-west-1:123456789012:outpost/op-0123456789abcdef0", "instance_count": 6, "preferred_instance_type": "m5.xlarge"}


def test_global_resolver_crud_addresses_and_validation(client):
    created = client.post("/api/resources/global_resolver", json=GR)
    assert created.status_code == 201, created.text
    body = created.json()
    rid = body["id"]
    assert rid.startswith("gr-") and body["status"] == "OPERATIONAL"
    assert len(body["ipv4_addresses"]) == 2 and len(body["ipv6_addresses"]) == 2
    assert body["dns_name"] == f"{rid}.globalresolver.route53.aws" and body["arn"].endswith(f":global-resolver/{rid}")
    # addresses are stable for the resolver
    assert client.get(f"/api/resources/global_resolver/{rid}").json()["ipv4_addresses"] == body["ipv4_addresses"]

    ipv4_only = client.put(f"/api/resources/global_resolver/{rid}", json={**GR, "ip_address_type": "IPV4"}).json()
    assert ipv4_only["ipv6_addresses"] == []

    bad = client.post("/api/resources/global_resolver", json={**GR, "name": "x", "regions": [], "observability_region": "mars-1"})
    assert bad.status_code == 422
    assert client.post("/api/resources/global_resolver", json={**GR, "name": "y", "regions": ["moon-1"]}).status_code == 422
    assert client.post("/api/resources/global_resolver", json={**GR, "name": "z", "regions": ["us-east-1"] * 3}).json()["regions"] == ["us-east-1"]
    assert client.post("/api/resources/global_resolver", json=GR).status_code == 409  # duplicate name

    assert client.delete(f"/api/resources/global_resolver/{rid}").status_code in (200, 204)
    assert client.get(f"/api/resources/global_resolver/{rid}").status_code == 404


def test_shared_dns_views_are_read_only(client):
    from app.db.session import SessionLocal
    from app.models import Resource

    me = client.get("/api/auth/me").json()
    with SessionLocal() as db:  # views arrive from another account through RAM, so they are inserted directly
        db.add(Resource(owner_id=me["id"], kind="shared_dns_view", public_id="dnsview-0123456789abcdef0", name="shared", status="ACTIVE", data={"name": "shared", "owner_account_id": "111122223333"}))
        db.commit()
    views = client.get("/api/resources/shared_dns_view").json()
    assert views["total"] >= 1
    view = views["items"][0]
    assert view["owner_account_id"] == "111122223333"
    refused = client.post("/api/resources/shared_dns_view", json={"name": "mine"})
    assert refused.status_code in (400, 422) and "Resource Access Manager" in refused.json()["detail"]
    assert client.put(f"/api/resources/shared_dns_view/{view['id']}", json={"name": view["name"]}).status_code in (400, 422)
    assert client.delete(f"/api/resources/shared_dns_view/{view['id']}").status_code == 409


def test_outpost_resolver_validation_and_derived_fields(client):
    bad = client.post("/api/resources/resolver_outpost", json={**OUTPOST, "outpost_arn": "arn:aws:ec2:::nope", "instance_count": 2, "preferred_instance_type": "big"})
    assert bad.status_code == 422
    assert {e["field"] for e in bad.json()["errors"]} >= {"outpost_arn", "instance_count", "preferred_instance_type"}

    created = client.post("/api/resources/resolver_outpost", json=OUTPOST)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["outpost_id"] == "op-0123456789abcdef0" and body["outpost_region"] == "eu-west-1"
    assert body["availability_zone_id"].startswith("ew1-az") and body["status"] == "OPERATIONAL"
    assert client.get("/api/resources/resolver_outpost?q=plant").json()["total"] == 1


def test_new_kinds_are_isolated_per_account(client, other_client):
    rid = client.post("/api/resources/global_resolver", json=GR).json()["id"]
    oid = client.post("/api/resources/resolver_outpost", json=OUTPOST).json()["id"]
    assert other_client.get(f"/api/resources/global_resolver/{rid}").status_code == 404
    assert other_client.get(f"/api/resources/resolver_outpost/{oid}").status_code == 404
    assert other_client.get("/api/resources/global_resolver").json()["total"] == 0


def test_feedback_is_kept_in_the_activity_log(client):
    sent = client.post("/api/activity/feedback", json={"message": "Great console", "sentiment": "positive", "page": "/dashboard"})
    assert sent.status_code == 201 and "Thank you" in sent.json()["detail"]
    assert client.post("/api/activity/feedback", json={"message": ""}).status_code == 422
    feed = client.get("/api/activity", params={"filter_resource_type": "Feedback"}).json()
    assert feed["total"] == 1 and feed["items"][0]["name"] == "Great console"
