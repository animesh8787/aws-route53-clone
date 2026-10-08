from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> Engine:
    is_libsql = url.startswith("sqlite+libsql")  # Turso / libSQL: SQLite-compatible hosted database
    is_sqlite = url.startswith("sqlite") and not is_libsql
    connect_args: dict = {}
    if is_sqlite:
        connect_args["check_same_thread"] = False
    elif is_libsql and (token := get_settings().turso_auth_token):
        connect_args["auth_token"] = token
    engine = create_engine(url, connect_args=connect_args)
    if is_sqlite or is_libsql:

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record):
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

    return engine


engine = make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
