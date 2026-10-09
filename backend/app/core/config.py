"""Application settings, loaded from environment variables / .env."""
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'route53.db').as_posix()}"
    turso_auth_token: str = ""  # only for sqlite+libsql:// (Turso) URLs
    secret_key: str = "change-me-in-production"
    cookie_name: str = "r53_session"
    cookie_secure: bool = False
    session_ttl_hours: int = 24 * 7
    cors_origins: str = "http://localhost:3000"
    seed_on_start: bool = True
    demo_email: str = "demo@example.com"
    demo_password: str = "password"
    log_level: str = "INFO"
    allow_registration: bool = True
    max_failed_logins: int = 5
    lockout_minutes: int = 15
    max_sessions_per_user: int = 10

    @field_validator("database_url", mode="before")
    @classmethod
    def _blank_url_means_default(cls, value: str) -> str:
        # Hosting dashboards often pass unset variables through as empty strings.
        return value or f"sqlite:///{(BACKEND_DIR / 'route53.db').as_posix()}"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
