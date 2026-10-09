from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class HealthCheck(Base):
    """A (simulated) Route 53 health check. ``status`` is toggled by hand and drives failover/multivalue answers."""

    __tablename__ = "health_checks"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    health_check_id: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(20), default="HTTP")  # HTTP | HTTPS | HTTP_STR_MATCH | HTTPS_STR_MATCH | TCP
    endpoint: Mapped[str] = mapped_column(String(255))  # IP address or domain name
    port: Mapped[int] = mapped_column(Integer, default=80)
    path: Mapped[str] = mapped_column(String(255), default="/")
    search_string: Mapped[str | None] = mapped_column(String(255), nullable=True)
    request_interval: Mapped[int] = mapped_column(Integer, default=30)
    failure_threshold: Mapped[int] = mapped_column(Integer, default=3)
    regions: Mapped[list] = mapped_column(JSON, default=list)
    inverted: Mapped[bool] = mapped_column(Boolean, default=False)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(12), default="HEALTHY")  # HEALTHY | UNHEALTHY
    history: Mapped[list] = mapped_column(JSON, default=list)  # [{"status", "at", "note"}], newest first
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
