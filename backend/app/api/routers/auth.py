from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.errors import AuthError
from app.core.security import hash_token, new_session_token, verify_password
from app.db.session import get_db
from app.models import User, UserSession
from app.schemas.auth import LoginRequest, UserOut
from app.schemas.common import Message

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    settings = get_settings()
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise AuthError("Incorrect email or password.")
    token = new_session_token()
    ttl = timedelta(hours=settings.session_ttl_hours)
    db.add(UserSession(token_hash=hash_token(token), user_id=user.id, expires_at=datetime.utcnow() + ttl))
    db.commit()
    response.set_cookie(
        settings.cookie_name, token, max_age=int(ttl.total_seconds()),
        httponly=True, samesite="lax", secure=settings.cookie_secure, path="/",
    )  # fmt: skip
    return user


@router.post("/logout", response_model=Message)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    settings = get_settings()
    token = request.cookies.get(settings.cookie_name)
    if token:
        session = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
        if session:
            db.delete(session)
            db.commit()
    response.delete_cookie(settings.cookie_name, path="/")
    return Message(detail="Signed out.")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
