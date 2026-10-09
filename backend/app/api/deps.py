from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AuthError
from app.db.session import get_db
from app.models import User, UserSession
from app.services import auth_service


def get_current_session(request: Request, db: Session = Depends(get_db)) -> UserSession:
    token = request.cookies.get(get_settings().cookie_name)
    if not token:
        raise AuthError("Not authenticated.")
    session = auth_service.find_session(db, token)
    if session is None:
        raise AuthError("Your session has expired. Please sign in again.")
    return session


def get_current_user(session: UserSession = Depends(get_current_session)) -> User:
    return session.user
