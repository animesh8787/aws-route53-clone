"""Application settings, loaded from environment variables / .env."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./route53.db"
    secret_key: str = "change-me-in-production"
    cookie_name: str = "r53_session"
    cookie_secure: bool = False
    session_ttl_hours: int = 24 * 7
    cors_origins: str = "http://localhost:3000"
    seed_on_start: bool = True
    demo_email: str = "demo@example.com"
    demo_password: str = "password"
    log_level: str = "INFO"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
