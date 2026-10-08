from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class HealthCheck(Base):
    """Mocked health check; ``status`` drives failover/multivalue resolution."""

    __tablename__ = "mock_health_checks"

    id: Mapped[int] = mapped_column(primary_key=True)
    health_check_id: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    target: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(12), default="HEALTHY")  # HEALTHY | UNHEALTHY
