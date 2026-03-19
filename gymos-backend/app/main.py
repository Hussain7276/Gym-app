"""
app/main.py
────────────
FastAPI application factory.
  • Mounts all v1 routes under /api/v1
  • CORS, trusted hosts, and global exception handlers
  • Lifespan events (DB warmup on startup)
  • OpenAPI docs with JWT security scheme
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.infrastructure.database import engine

logger = structlog.get_logger()


# ── Lifespan ──────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup / shutdown."""
    logger.info("GymOS starting up", version=settings.APP_VERSION, env=settings.ENVIRONMENT)
    # Warm connection pool
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: None)
    yield
    logger.info("GymOS shutting down")
    await engine.dispose()


# ── App factory ───────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="Enterprise Gym Management System API",
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        lifespan=lifespan,
        swagger_ui_parameters={"persistAuthorization": True},
    )

    # ── Security scheme for Swagger UI ────────────────────────────
    from fastapi.openapi.utils import get_openapi
    def custom_openapi():
        if app.openapi_schema:
            return app.openapi_schema
        schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )
        schema["components"]["securitySchemes"] = {
            "BearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
        }
        for path in schema.get("paths", {}).values():
            for method in path.values():
                method.setdefault("security", [{"BearerAuth": []}])
        app.openapi_schema = schema
        return schema

    app.openapi = custom_openapi
    # ── Middleware ────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS or ["http://localhot:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    if settings.is_production:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS)

    # ── Exception handlers ────────────────────────────────────────
    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"field": ".".join(str(loc) for loc in e["loc"]), "message": e["msg"]}
            for e in exc.errors()
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"success": False, "errors": errors},
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "detail": exc.detail},
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled exception", exc_info=exc, path=request.url.path)
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": "Internal server error"},
        )

    # ── Routes ────────────────────────────────────────────────────
    app.include_router(api_router, prefix=settings.API_PREFIX)

    @app.get("/health", tags=["Health"])
    async def health_check() -> dict[str, Any]:
        return {"status": "ok", "version": settings.APP_VERSION}

    return app


app = create_app()