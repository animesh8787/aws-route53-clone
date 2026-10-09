"""Accounts, sign-in, lockout and session management."""
import logging
import secrets
from datetime import datetime, timedelta

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, AuthError, ConflictError, ValidationFailure, field_error
from app.core.ratelimit import TooManyRequests
from app.core.security import hash_password, hash_token, new_session_token, password_problems, verify_password
from app.models import User, UserSession

logger = logging.getLogger("route53.auth")

# Compared against when the e-mail is unknown, so a miss costs the same as a wrong password.
_DUMMY_HASH = hash_password("not-a-real-password-1")
LAST_SEEN_RESOLUTION = timedelta(minutes=1)


def normalize_email(raw: str) -> str:
    try:
        return validate_email(raw.strip(), check_deliverability=False, test_environment=True).normalized.lower()
    except EmailNotValidError as exc:
        raise ValidationFailure(str(exc), [field_error("email", f"Enter a valid email address ({exc}).")]) from exc


def _new_account_id(db: Session) -> str:
    while True:
        candidate = "".join(secrets.choice("0123456789") for _ in range(12))
        if candidate[0] != "0" and db.scalar(select(User.id).where(User.account_id == candidate)) is None:
            return candidate


def _check_password(password: str, email: str, field: str = "password") -> None:
    problems = password_problems(password, email)
    if problems:
        raise ValidationFailure(problems[0], [field_error(field, p) for p in problems])


def register(db: Session, email: str, password: str, display_name: str) -> User:
    if not get_settings().allow_registration:
        raise AppError("Registration is disabled on this deployment.")
    email = normalize_email(email)
    name = display_name.strip() or email.split("@")[0]
    if len(name) > 50:
        raise ValidationFailure("Display name is too long.", [field_error("display_name", "Display name can have at most 50 characters.")])
    _check_password(password, email)
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise ConflictError("An account with this email address already exists. Sign in instead.")
    user = User(email=email, password_hash=hash_password(password), display_name=name, account_id=_new_account_id(db), password_changed_at=datetime.utcnow())
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("account registered user_id=%s", user.id)
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    """Check credentials, applying per-account lockout. Failures are indistinguishable from the outside."""
    settings = get_settings()
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    now = datetime.utcnow()
    if user is not None and user.locked_until and user.locked_until > now:
        minutes = max(1, int((user.locked_until - now).total_seconds() // 60) + 1)
        logger.warning("sign-in blocked (locked) user_id=%s", user.id)
        raise TooManyRequests(f"Too many failed sign-in attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.")
    valid = verify_password(password, user.password_hash if user else _DUMMY_HASH)
    if user is None or not valid:
        if user is not None:
            user.failed_logins += 1
            if user.failed_logins >= settings.max_failed_logins:
                user.locked_until = now + timedelta(minutes=settings.lockout_minutes)
                user.failed_logins = 0
                logger.warning("account locked user_id=%s", user.id)
            db.commit()
        raise AuthError("Incorrect email or password.")
    if user.failed_logins or user.locked_until:
        user.failed_logins, user.locked_until = 0, None
        db.commit()
    return user


def create_session(db: Session, user: User, *, ip: str, user_agent: str) -> tuple[str, UserSession]:
    """Issue a fresh token (never reuse one across sign-ins) and keep the session list bounded."""
    settings = get_settings()
    now = datetime.utcnow()
    db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at < now))
    token = new_session_token()
    session = UserSession(
        token_hash=hash_token(token), user_id=user.id, expires_at=now + timedelta(hours=settings.session_ttl_hours),
        user_agent=user_agent[:255], ip_address=ip[:64], last_seen_at=now,
    )  # fmt: skip
    db.add(session)
    db.flush()
    sessions = db.scalars(select(UserSession).where(UserSession.user_id == user.id).order_by(UserSession.id.desc())).all()
    for old in sessions[settings.max_sessions_per_user :]:
        db.delete(old)
    db.commit()
    return token, session


def find_session(db: Session, token: str) -> UserSession | None:
    session = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    if session is None or session.expires_at < datetime.utcnow():
        return None
    now = datetime.utcnow()
    if now - session.last_seen_at > LAST_SEEN_RESOLUTION:
        session.last_seen_at = now
        db.commit()
    return session


def change_password(db: Session, user: User, current: str, new: str, keep_session_id: int) -> None:
    if not verify_password(current, user.password_hash):
        raise ValidationFailure("The current password is incorrect.", [field_error("current_password", "The current password is incorrect.")])
    _check_password(new, user.email, "new_password")
    if verify_password(new, user.password_hash):
        raise ValidationFailure("Choose a password you have not used before.", [field_error("new_password", "The new password must be different from the current one.")])
    user.password_hash = hash_password(new)
    user.password_changed_at = datetime.utcnow()
    db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.id != keep_session_id))
    db.commit()
    logger.info("password changed user_id=%s", user.id)


def list_sessions(db: Session, user: User, current_id: int) -> list[dict]:
    rows = db.scalars(select(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at > datetime.utcnow()).order_by(UserSession.last_seen_at.desc())).all()
    return [
        {"id": s.id, "created_at": s.created_at, "last_seen_at": s.last_seen_at, "user_agent": s.user_agent, "ip_address": s.ip_address, "is_current": s.id == current_id}
        for s in rows
    ]  # fmt: skip


def revoke_session(db: Session, user: User, session_id: int) -> None:
    session = db.get(UserSession, session_id)
    if session is None or session.user_id != user.id:
        raise AppError("Session not found.")
    db.delete(session)
    db.commit()


def revoke_other_sessions(db: Session, user: User, keep_id: int) -> int:
    result = db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.id != keep_id))
    db.commit()
    return result.rowcount or 0


def delete_account(db: Session, user: User, password: str) -> None:
    if not verify_password(password, user.password_hash):
        raise ValidationFailure("The password is incorrect.", [field_error("password", "The password is incorrect.")])
    db.delete(user)
    db.commit()
    logger.info("account deleted user_id=%s", user.id)
