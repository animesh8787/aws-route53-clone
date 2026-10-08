from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class VpcAssociation(Base):
    """Mocked VPC association for private hosted zones (no AWS integration)."""

    __tablename__ = "vpc_associations"

    id: Mapped[int] = mapped_column(primary_key=True)
    hosted_zone_id: Mapped[int] = mapped_column(ForeignKey("hosted_zones.id", ondelete="CASCADE"), index=True)
    vpc_id: Mapped[str] = mapped_column(String(32))
    region: Mapped[str] = mapped_column(String(32))

    zone = relationship("HostedZone", back_populates="vpcs")
