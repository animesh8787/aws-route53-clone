import pytest
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.dns import validators as v
from app.models import DnsRecord, HostedZone
from app.seed import seed_all


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("EXAMPLE.com.", "example.com"), ("  Sub.Example.Org ", "sub.example.org"), ("a-b.co.uk", "a-b.co.uk")],
)
def test_zone_name_normalisation(raw, expected):
    assert v.normalize_zone_name(raw) == expected


@pytest.mark.parametrize("raw", ["", "localhost", "-bad.com", "bad-.com", "a..b.com", "x" * 64 + ".com", "example.123", "*.example.com"])
def test_invalid_zone_names(raw):
    with pytest.raises(v.DnsValueError):
        v.normalize_zone_name(raw)


@pytest.mark.parametrize(
    ("raw", "fqdn"),
    [("", "example.com."), ("@", "example.com."), ("www", "www.example.com."), ("www.example.com", "www.example.com."),
     ("WWW.Example.com.", "www.example.com."), ("*.dev", "*.dev.example.com."), ("_dmarc", "_dmarc.example.com.")],
)  # fmt: skip
def test_record_names_resolve_into_zone(raw, fqdn):
    assert v.to_fqdn(raw, "example.com") == fqdn


@pytest.mark.parametrize("raw", ["www.other.com.", "a.*.example.com", "bad name", "-x"])
def test_record_names_outside_or_malformed(raw):
    with pytest.raises(v.DnsValueError):
        v.to_fqdn(raw, "example.com")


def test_ipv6_and_ipv4_edge_cases():
    assert v.validate_ipv6("2001:DB8:0:0:0:0:0:1") == "2001:db8::1"
    assert v.validate_ipv4("10.0.0.1") == "10.0.0.1"
    for bad in ["01.2.3.4", "1.2.3", "1.2.3.4.5", "256.1.1.1"]:
        with pytest.raises(v.DnsValueError):
            v.validate_ipv4(bad)
    for bad in ["::g", "1:2:3:4:5:6:7:8:9", "12345::1"]:
        with pytest.raises(v.DnsValueError):
            v.validate_ipv6(bad)


def test_value_round_trip_through_parse():
    cases = {
        "MX": "10 mail.example.com.",
        "SRV": "10 5 5060 sip.example.com.",
        "CAA": '0 issue "letsencrypt.org"',
    }
    for rtype, value in cases.items():
        assert v.canonical_value(rtype, value) == value
        assert v.parse_value(rtype, value)
    assert v.parse_value("MX", cases["MX"]) == {"priority": 10, "exchange": "mail.example.com."}


def test_ttl_bounds():
    assert v.validate_ttl(0) == 0
    for bad in (-1, 2_147_483_648):
        with pytest.raises(v.DnsValueError):
            v.validate_ttl(bad)


def test_seed_populates_all_record_types_and_policies(empty_db):
    with SessionLocal() as db:
        seed_all(db)
        seed_all(db)  # idempotent
        assert db.scalar(select(func.count()).select_from(HostedZone)) >= 20
        types = set(db.scalars(select(DnsRecord.type).distinct()))
        assert {"A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA", "SOA"} <= types
        policies = set(db.scalars(select(DnsRecord.routing_policy).distinct()))
        assert policies == {"simple", "weighted", "latency", "failover", "geolocation", "multivalue", "ipbased"}
        private = db.scalar(select(HostedZone).where(HostedZone.name == "internal.local"))
        assert private.is_private and private.vpcs
