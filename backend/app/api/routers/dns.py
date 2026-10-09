from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.dns.mock_data import MOCK_VPCS
from app.models import DnsRecord, HealthCheck, HostedZone, User
from app.schemas.dns import DashboardSummary, ResolveResponse
from app.services import resolver_service

router = APIRouter(tags=["dns"], dependencies=[Depends(get_current_user)])


@router.get("/dns/resolve", response_model=ResolveResponse)
def resolve(
    name: str,
    type: str = "A",
    view: Literal["public", "private"] = "public",
    client_region: str | None = None,
    client_country: str | None = None,
    client_continent: str | None = None,
    client_ip: str | None = None,
    seed: int | None = None,
    db: Session = Depends(get_db),
):
    """Simulate a DNS query against the stored records (applies routing policies)."""
    return resolver_service.resolve(
        db, name, type, view=view, client_region=client_region, client_country=client_country,
        client_continent=client_continent, client_ip=client_ip, seed=seed,
    )  # fmt: skip


@router.get("/vpcs")
def list_mock_vpcs(region: str | None = None):
    """Mocked VPCs (optionally for one region), used by private zones, profiles, resolver and firewall."""
    return [v for v in MOCK_VPCS if region is None or v["region"] == region]


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    zones = db.scalar(select(func.count()).select_from(HostedZone)) or 0
    private = db.scalar(select(func.count()).where(HostedZone.is_private.is_(True))) or 0
    recent = db.scalars(select(HostedZone).order_by(HostedZone.created_at.desc(), HostedZone.id.desc()).limit(5)).all()
    health = select(func.count()).select_from(HealthCheck).where(HealthCheck.owner_id == user.id)
    return DashboardSummary(
        hosted_zones=zones,
        public_zones=zones - private,
        private_zones=private,
        records=db.scalar(select(func.count()).select_from(DnsRecord)) or 0,
        health_checks=db.scalar(health) or 0,
        unhealthy_health_checks=db.scalar(health.where(HealthCheck.status == "UNHEALTHY")) or 0,
        recent_zones=[{"zone_id": z.zone_id, "name": z.name, "type": "private" if z.is_private else "public", "record_count": z.record_count} for z in recent],
    )  # fmt: skip
