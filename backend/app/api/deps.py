from datetime import datetime

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AuthError
from app.core.security import hash_token
from app.db.session import get_db
from app.models import User, UserSession


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(get_settings().cookie_name)
    if not token:
        raise AuthError("Not authenticated.")
    session = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    if session is None or session.expires_at < datetime.utcnow():
        raise AuthError("Your session has expired. Please sign in again.")
    return session.user
