from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str = ""


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ProfileUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=50)


class DeleteAccountRequest(BaseModel):
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str
    account_id: str
    created_at: datetime | None = None
    password_changed_at: datetime | None = None


class SessionOut(BaseModel):
    id: int
    created_at: datetime
    last_seen_at: datetime
    user_agent: str
    ip_address: str
    is_current: bool


class AuthConfig(BaseModel):
    registration_enabled: bool
    password_min_length: int
    max_failed_logins: int
    lockout_minutes: int
