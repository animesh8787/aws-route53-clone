from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.services import domain_service
from app.services.resources import service as resource_service
from app.services.resources.registry import get_kind

router = APIRouter(prefix="/domains", tags=["domains"])


class RenewRequest(BaseModel):
    years: int = 1


@router.get("/availability")
def check_availability(name: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Simulated availability and price for a name and the same label under popular TLDs."""
    return domain_service.availability(db, user.id, name)


@router.post("/{domain_id}/renew")
def renew_domain(domain_id: str, body: RenewRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    kind = get_kind("domain")
    domain = resource_service.get_owned(db, user.id, kind, domain_id)
    return resource_service.to_out(domain_service.renew(db, user.id, domain, body.years), db)


@router.post("/{domain_id}/transfer-out")
def request_transfer_out(domain_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    kind = get_kind("domain")
    domain = resource_service.get_owned(db, user.id, kind, domain_id)
    return {"auth_code": domain_service.transfer_out(db, user.id, domain)}
