"""FastAPI application factory."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import models  # noqa: F401  (register tables)
from app.api.routers import auth, dns, hosted_zones, import_export, records
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.logging import configure_logging
from app.db.session import Base, SessionLocal, engine

logger = logging.getLogger("route53")


def _error(status: int, detail: str, errors: list | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": detail, "errors": errors or []})


def _friendly_loc(loc: tuple) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path")]
    return ".".join(parts) or "request"


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    if get_settings().seed_on_start:
        from app.seed import seed_all

        with SessionLocal() as db:
            seed_all(db)
    yield


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    app = FastAPI(title="Route 53 Clone API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"],
    )  # fmt: skip

    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return _error(exc.status_code, exc.detail, exc.errors)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        errors = [{"field": _friendly_loc(e["loc"]), "message": e["msg"]} for e in exc.errors()]
        detail = f"{errors[0]['field']}: {errors[0]['message']}" if errors else "Invalid request."
        return _error(422, detail, errors)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        return _error(exc.status_code, str(exc.detail))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        logger.exception("Unhandled error", exc_info=exc)
        return _error(500, "An unexpected error occurred. Please try again.")

    @app.get("/api/health", tags=["meta"])
    def health():
        return {"status": "ok"}

    for router in (auth.router, hosted_zones.router, records.zone_records, import_export.router, records.records, dns.router):
        app.include_router(router, prefix="/api")
    return app


app = create_app()
