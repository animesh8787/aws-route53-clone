from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.services import billing_service

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/estimate")
def monthly_estimate(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Estimated monthly cost of the resources in the account (illustrative prices, nothing is charged)."""
    return billing_service.estimate(db, user.id)
