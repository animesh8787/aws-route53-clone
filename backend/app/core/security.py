"""Password hashing and opaque session-token helpers."""
import hashlib
import secrets

import bcrypt


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Only the SHA-256 of a session token is stored, so a DB leak cannot be replayed."""
    return hashlib.sha256(token.encode()).hexdigest()


# ---------------------------------------------------------------- password policy
MIN_PASSWORD_LENGTH = 10
MAX_PASSWORD_BYTES = 72  # bcrypt ignores (and bcrypt 5 rejects) anything beyond 72 bytes
_COMMON_PASSWORDS = {
    "password", "password1", "password123", "1234567890", "12345678910", "qwertyuiop", "qwerty12345",
    "iloveyou123", "admin12345", "letmein123", "welcome123", "abc1234567",
}  # fmt: skip


def password_problems(password: str, email: str = "") -> list[str]:
    """Return every rule the password breaks (empty list means acceptable)."""
    problems = []
    if len(password) < MIN_PASSWORD_LENGTH:
        problems.append(f"Use at least {MIN_PASSWORD_LENGTH} characters.")
    if len(password.encode()) > MAX_PASSWORD_BYTES:
        problems.append(f"Use at most {MAX_PASSWORD_BYTES} bytes (about {MAX_PASSWORD_BYTES} characters).")
    if not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        problems.append("Include at least one letter and one number.")
    lowered = password.lower()
    local = email.split("@")[0].lower() if email else ""
    if lowered in _COMMON_PASSWORDS or (len(local) >= 4 and local in lowered):
        problems.append("Choose a password that is not common and does not contain your email name.")
    return problems
