"""FastAPI application factory for the CareerLens NLP service."""

from __future__ import annotations

import hmac
import json
import logging
import sys
import time
import uuid
from contextlib import asynccontextmanager

import anyio
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.config import Settings, get_settings
from app.errors import ModelUnavailableError, ServiceError
from app.nlp.analyzer import Analyzer
from app.nlp.embeddings import Embedder, FastEmbedEmbedder
from app.nlp.scoring import load_scoring_config
from app.nlp.taxonomy import load_taxonomy

log = logging.getLogger("careerlens.ai")
PUBLIC_PATHS = frozenset({"/health", "/ready", "/docs", "/openapi.json", "/redoc"})


class JsonFormatter(logging.Formatter):
    """One JSON object per line; never includes request bodies or document text."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"), "level": record.levelname,
            "logger": record.name, "msg": record.getMessage(),
        }
        for key in ("request_id", "method", "path", "status", "duration_ms"):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload["exc_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None
        return json.dumps(payload)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())


def _error(status: int, code: str, message: str, details: list[str] | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"code": code, "message": message, "details": details or []})


def create_app(settings: Settings | None = None, embedder: Embedder | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    taxonomy = load_taxonomy(settings.taxonomy_path)
    scoring = load_scoring_config()
    model = embedder or FastEmbedEmbedder(settings.embedding_model, settings.model_cache_dir,
                                          settings.model_threads, settings.model_offline)

    @asynccontextmanager
    async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
        if settings.preload_model and hasattr(model, "load"):
            try:
                await anyio.to_thread.run_sync(model.load)
            except ModelUnavailableError:
                log.error("startup_model_unavailable - service will report not-ready until the model loads")
        yield
        log.info("shutdown_complete")

    is_prod = settings.environment.lower() == "production"
    app = FastAPI(
        title="CareerLens AI - NLP Service",
        version="1.0.0",
        description="PDF extraction, skill extraction, semantic similarity and explainable scoring.",
        lifespan=lifespan,
        docs_url=None if is_prod else "/docs",
        redoc_url=None,
        openapi_url=None if is_prod else "/openapi.json",
    )
    app.state.settings = settings
    app.state.analyzer = Analyzer(model, taxonomy, scoring, settings)
    app.state.inference_limiter = anyio.CapacityLimiter(settings.max_concurrent_inferences)
    max_body = settings.max_upload_bytes + 64 * 1024

    @app.middleware("http")
    async def guard(request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        start = time.perf_counter()
        if request.url.path not in PUBLIC_PATHS and settings.internal_api_key:
            supplied = request.headers.get("x-internal-api-key", "")
            if not hmac.compare_digest(supplied.encode(), settings.internal_api_key.encode()):
                return _error(401, "UNAUTHORIZED", "A valid internal API key is required.")
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > max_body:
            return _error(413, "PAYLOAD_TOO_LARGE", "The request body is too large.")
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        log.info("request", extra={"request_id": request_id, "method": request.method, "path": request.url.path,
                                   "status": response.status_code,
                                   "duration_ms": round((time.perf_counter() - start) * 1000, 1)})
        return response

    @app.exception_handler(ServiceError)
    async def service_error(_: Request, exc: ServiceError) -> JSONResponse:
        log.info("service_error code=%s status=%d", exc.code, exc.status_code)
        return _error(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Deliberately omit the offending input values: they may contain resume text.
        details = [f"{'.'.join(str(p) for p in e.get('loc', []) if p != 'body')}: {e.get('msg')}" for e in exc.errors()]
        return _error(422, "VALIDATION_ERROR", "The request is invalid.", details[:20])

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled_error type=%s", type(exc).__name__)
        return _error(500, "INTERNAL_ERROR", "An unexpected error occurred while processing the request.")

    app.include_router(router)
    return app

