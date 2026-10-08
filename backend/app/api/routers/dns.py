from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import NotFoundError, ValidationFailure
from app.db.session import get_db
from app.models import DnsRecord, HealthCheck, HostedZone
from app.schemas.dns import (
    DashboardSummary,
    HealthCheckOut,
    HealthCheckUpdate,
    ResolveResponse,
)
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
    seed: int | None = None,
    db: Session = Depends(get_db),
):
    """Simulate a DNS query against the stored records (applies routing policies)."""
    return resolver_service.resolve(
        db, name, type, view=view, client_region=client_region, client_country=client_country,
        client_continent=client_continent, seed=seed,
    )  # fmt: skip


@router.get("/health-checks", response_model=list[HealthCheckOut])
def list_health_checks(db: Session = Depends(get_db)):
    return db.scalars(select(HealthCheck).order_by(HealthCheck.name)).all()


@router.patch("/health-checks/{health_check_id}", response_model=HealthCheckOut)
def set_health_status(health_check_id: str, body: HealthCheckUpdate, db: Session = Depends(get_db)):
    health = db.scalar(select(HealthCheck).where(HealthCheck.health_check_id == health_check_id))
    if health is None:
        raise NotFoundError("Health check not found.")
    status = body.status.upper()
    if status not in ("HEALTHY", "UNHEALTHY"):
        raise ValidationFailure("Status must be HEALTHY or UNHEALTHY.")
    health.status = status
    db.commit()
    return health


@router.get("/vpcs")
def list_mock_vpcs(region: str = "us-east-1"):
    """Mocked VPC list for the private hosted zone creation form."""
    return [
        {"vpc_id": "vpc-0a1b2c3d4e5f60789", "name": "production-vpc", "region": region, "cidr": "10.0.0.0/16"},
        {"vpc_id": "vpc-0f9e8d7c6b5a43210", "name": "staging-vpc", "region": region, "cidr": "10.1.0.0/16"},
        {"vpc_id": "vpc-01234abcd5678ef90", "name": "default-vpc", "region": region, "cidr": "172.31.0.0/16"},
    ]


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard(db: Session = Depends(get_db)):
    zones = db.scalar(select(func.count()).select_from(HostedZone)) or 0
    private = db.scalar(select(func.count()).where(HostedZone.is_private.is_(True))) or 0
    recent = db.scalars(select(HostedZone).order_by(HostedZone.created_at.desc(), HostedZone.id.desc()).limit(5)).all()
    return DashboardSummary(
        hosted_zones=zones,
        public_zones=zones - private,
        private_zones=private,
        records=db.scalar(select(func.count()).select_from(DnsRecord)) or 0,
        health_checks=db.scalar(select(func.count()).select_from(HealthCheck)) or 0,
        unhealthy_health_checks=db.scalar(select(func.count()).where(HealthCheck.status == "UNHEALTHY")) or 0,
        recent_zones=[{"zone_id": z.zone_id, "name": z.name, "type": "private" if z.is_private else "public", "record_count": z.record_count} for z in recent],
    )
