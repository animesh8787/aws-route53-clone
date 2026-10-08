from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class HostedZone(Base):
    __tablename__ = "hosted_zones"
    __table_args__ = (UniqueConstraint("name", "is_private", name="uq_zone_name_type"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    zone_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)  # stored without trailing dot
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    comment: Mapped[str] = mapped_column(String(256), default="")
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str] = mapped_column(String(100), default="Route 53")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    records = relationship("DnsRecord", back_populates="zone", cascade="all, delete-orphan", passive_deletes=True)
    vpcs = relationship(
        "VpcAssociation", back_populates="zone", cascade="all, delete-orphan", passive_deletes=True, lazy="selectin"
    )
