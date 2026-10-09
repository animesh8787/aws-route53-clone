from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Resource(Base):
    """A console configuration object (profile, resolver endpoint/rule, firewall rule group, CIDR collection...).

    Core DNS entities (zones, records, health checks) are relational tables. These objects are
    heterogeneous and rarely joined, so each kind keeps its validated Pydantic payload in ``data``.
    """

    __tablename__ = "resources"
    __table_args__ = (
        UniqueConstraint("owner_id", "kind", "name", name="uq_resource_owner_kind_name"),
        Index("ix_resources_owner_kind", "owner_id", "kind"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(32))
    public_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class ActivityEvent(Base):
    """Audit trail shown in the notifications bell."""

    __tablename__ = "activity_events"
    __table_args__ = (Index("ix_activity_owner_created", "owner_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    action: Mapped[str] = mapped_column(String(32))  # created | updated | deleted | imported | ...
    resource_type: Mapped[str] = mapped_column(String(40))
    resource_name: Mapped[str] = mapped_column(String(255))
    href: Mapped[str | None] = mapped_column(String(255), nullable=True)
    detail: Mapped[str] = mapped_column(String(255), default="")
    is_read: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
