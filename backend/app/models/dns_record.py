from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class DnsRecord(Base):
    """A Route 53 *resource record set*: one name/type (+ set identifier) with N values.

    ``values`` holds canonical presentation-format strings (``10 mail.example.com.``).
    Routing and alias settings are normalised columns so they can be filtered and indexed.
    """

    __tablename__ = "dns_records"
    __table_args__ = (
        UniqueConstraint("hosted_zone_id", "name", "type", "set_identifier", name="uq_record_identity"),
        Index("ix_records_zone_name_type", "hosted_zone_id", "name", "type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    hosted_zone_id: Mapped[int] = mapped_column(ForeignKey("hosted_zones.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))  # absolute, lowercase, trailing dot
    type: Mapped[str] = mapped_column(String(8), index=True)
    ttl: Mapped[int | None] = mapped_column(Integer, nullable=True)
    values: Mapped[list] = mapped_column(JSON, default=list)

    routing_policy: Mapped[str] = mapped_column(String(16), default="simple")
    set_identifier: Mapped[str] = mapped_column(String(128), default="")  # "" == none (keeps UNIQUE usable)
    weight: Mapped[int | None] = mapped_column(Integer, nullable=True)
    region: Mapped[str | None] = mapped_column(String(32), nullable=True)
    failover: Mapped[str | None] = mapped_column(String(10), nullable=True)
    geo_continent: Mapped[str | None] = mapped_column(String(2), nullable=True)
    geo_country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    geo_subdivision: Mapped[str | None] = mapped_column(String(3), nullable=True)

    cidr_collection_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)  # public id of a CIDR collection
    cidr_location: Mapped[str | None] = mapped_column(String(64), nullable=True)  # location name, or "*" for the default
    policy_record_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)  # set when managed by a traffic policy record

    alias_target: Mapped[str | None] = mapped_column(String(255), nullable=True)
    alias_target_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    alias_hosted_zone_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    evaluate_target_health: Mapped[bool] = mapped_column(Boolean, default=False)

    health_check_id: Mapped[int | None] = mapped_column(
        ForeignKey("health_checks.id", ondelete="SET NULL"), nullable=True
    )
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    zone = relationship("HostedZone", back_populates="records")
    health_check = relationship("HealthCheck", lazy="joined")

    @property
    def is_alias(self) -> bool:
        return self.alias_target is not None
