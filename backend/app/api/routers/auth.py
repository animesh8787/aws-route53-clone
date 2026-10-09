from datetime import timedelta

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_session, get_current_user
from app.core.config import get_settings
from app.core.ratelimit import client_ip, login_limiter, register_limiter
from app.core.security import MIN_PASSWORD_LENGTH, hash_token
from app.db.session import get_db
from app.models import User, UserSession
from app.schemas.auth import (
    AuthConfig,
    ChangePasswordRequest,
    DeleteAccountRequest,
    LoginRequest,
    ProfileUpdate,
    RegisterRequest,
    SessionOut,
    UserOut,
)
from app.schemas.common import Message
from app.services import activity_service, auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.cookie_name, token, max_age=int(timedelta(hours=settings.session_ttl_hours).total_seconds()),
        httponly=True, samesite="lax", secure=settings.cookie_secure, path="/",
    )  # fmt: skip


@router.get("/config", response_model=AuthConfig)
def auth_config():
    """Public settings the sign-up form needs."""
    s = get_settings()
    return AuthConfig(registration_enabled=s.allow_registration, password_min_length=MIN_PASSWORD_LENGTH, max_failed_logins=s.max_failed_logins, lockout_minutes=s.lockout_minutes)


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    register_limiter.check(client_ip(request))
    user = auth_service.register(db, body.email, body.password, body.display_name)
    token, _ = auth_service.create_session(db, user, ip=client_ip(request), user_agent=request.headers.get("user-agent", ""))
    _set_cookie(response, token)
    activity_service.log(db, user.id, "created", "Account", user.email, href="/account")
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = client_ip(request)
    login_limiter.check(ip)
    user = auth_service.authenticate(db, body.email, body.password)
    token, _ = auth_service.create_session(db, user, ip=ip, user_agent=request.headers.get("user-agent", ""))
    _set_cookie(response, token)
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


@router.patch("/me", response_model=UserOut)
def update_profile(body: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.display_name = body.display_name.strip()
    db.commit()
    db.refresh(user)
    return user


@router.delete("/me", response_model=Message)
def close_account(body: DeleteAccountRequest, response: Response, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    auth_service.delete_account(db, user, body.password)
    response.delete_cookie(get_settings().cookie_name, path="/")
    return Message(detail="Your account and all its data were deleted.")


@router.post("/change-password", response_model=Message)
def change_password(
    body: ChangePasswordRequest, session: UserSession = Depends(get_current_session), db: Session = Depends(get_db),
):  # fmt: skip
    auth_service.change_password(db, session.user, body.current_password, body.new_password, session.id)
    activity_service.log(db, session.user_id, "updated", "Account", "Password changed", href="/security-credentials", detail="Other sessions were signed out")
    return Message(detail="Password changed. Other sessions were signed out.")


@router.get("/sessions", response_model=list[SessionOut])
def sessions(session: UserSession = Depends(get_current_session), db: Session = Depends(get_db)):
    return auth_service.list_sessions(db, session.user, session.id)


@router.post("/sessions/revoke-others", response_model=Message)
def revoke_others(session: UserSession = Depends(get_current_session), db: Session = Depends(get_db)):
    count = auth_service.revoke_other_sessions(db, session.user, session.id)
    return Message(detail=f"Signed out of {count} other session(s).")


@router.delete("/sessions/{session_id}", response_model=Message)
def revoke(session_id: int, session: UserSession = Depends(get_current_session), db: Session = Depends(get_db)):
    auth_service.revoke_session(db, session.user, session_id)
    return Message(detail="Session signed out.")
