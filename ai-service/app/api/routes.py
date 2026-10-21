"""HTTP routes for the NLP service."""

from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

import anyio
from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import JSONResponse

from app.errors import DocumentTooLargeError, InferenceTimeoutError
from app.nlp.analyzer import MIN_RESUME_WORDS, Analyzer
from app.nlp.resume import parse_resume
from app.nlp.pdf import extract_pdf_text
from app.schemas import (
    AnalysisResult,
    AnalyzeRequest,
    ErrorResponse,
    HealthResponse,
    JobExtractRequest,
    JobRequirements,
    ProjectRelevanceResponse,
    ResumeExtractResponse,
    ResumeParseRequest,
    ResumeStructure,
    SkillComparisonResponse,
)

T = TypeVar("T")
router = APIRouter()
ERRORS = {
    400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 413: {"model": ErrorResponse},
    415: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 503: {"model": ErrorResponse},
    504: {"model": ErrorResponse},
}


def _analyzer(request: Request) -> Analyzer:
    return request.app.state.analyzer


async def run_limited(request: Request, fn: Callable[[], T]) -> T:
    """Run CPU-bound work in a worker thread with a concurrency cap and a hard timeout."""
    settings = request.app.state.settings
    limiter: anyio.CapacityLimiter = request.app.state.inference_limiter
    try:
        with anyio.fail_after(settings.inference_timeout_seconds):
            return await anyio.to_thread.run_sync(fn, limiter=limiter, abandon_on_cancel=True)
    except TimeoutError as exc:
        raise InferenceTimeoutError(
            f"Processing exceeded the {settings.inference_timeout_seconds:g}s limit. Try a shorter document."
        ) from exc


@router.get("/health", response_model=HealthResponse, tags=["health"])
async def health(request: Request) -> HealthResponse:
    a = _analyzer(request)
    return HealthResponse(
        status="ok" if a.embedder.loaded else "degraded", service=request.app.state.settings.service_name,
        model_loaded=a.embedder.loaded, model=a.embedder.name, taxonomy_version=a.taxonomy.version,
        scoring_version=a.config.version,
    )


@router.get("/ready", tags=["health"], responses={503: {"model": ErrorResponse}})
async def ready(request: Request) -> JSONResponse:
    a = _analyzer(request)
    if a.embedder.loaded:
        return JSONResponse({"status": "ready", "model": a.embedder.name})
    return JSONResponse(status_code=503, content={"code": "MODEL_NOT_LOADED", "message": "The embedding model is not loaded."})


@router.post("/v1/resume/extract", response_model=ResumeExtractResponse, tags=["resume"], responses=ERRORS)
async def extract_resume(request: Request, file: UploadFile = File(...)) -> ResumeExtractResponse:
    settings = request.app.state.settings
    data = await file.read(settings.max_upload_bytes + 1)
    await file.close()
    if len(data) > settings.max_upload_bytes:
        raise DocumentTooLargeError(f"The PDF exceeds the {settings.max_upload_bytes // (1024 * 1024)} MB upload limit.")
    filename = file.filename or "resume.pdf"
    analyzer = _analyzer(request)

    def work() -> ResumeExtractResponse:
        extraction = extract_pdf_text(data, filename=filename, max_bytes=settings.max_upload_bytes,
                                      max_pages=settings.max_pdf_pages, max_chars=settings.max_resume_chars)
        structure = analyzer.resume_structure(parse_resume(extraction.text))
        warnings = list(extraction.warnings)
        if structure.word_count < MIN_RESUME_WORDS:
            warnings.append("Very little text was extracted. Review it carefully before running an analysis.")
        if structure.missing:
            warnings.append("Sections not detected: " + ", ".join(structure.missing) + ". You can edit the text to add headings.")
        return ResumeExtractResponse(text=extraction.text, page_count=extraction.page_count,
                                     char_count=len(extraction.text), warnings=warnings, structure=structure)

    return await run_limited(request, work)


@router.post("/v1/resume/parse", response_model=ResumeStructure, tags=["resume"], responses=ERRORS)
async def parse_resume_text(request: Request, body: ResumeParseRequest) -> ResumeStructure:
    a = _analyzer(request)
    return await run_limited(request, lambda: a.resume_structure(a.parse_resume_text(body.resume_text)))


@router.post("/v1/job/extract", response_model=JobRequirements, tags=["job"], responses=ERRORS)
async def extract_job(request: Request, body: JobExtractRequest) -> JobRequirements:
    a = _analyzer(request)
    return await run_limited(request, lambda: a.parse_job(body.job_description).requirements)


@router.post("/v1/analyze", response_model=AnalysisResult, tags=["analysis"], responses=ERRORS)
async def analyze(request: Request, body: AnalyzeRequest) -> AnalysisResult:
    a = _analyzer(request)
    return await run_limited(request, lambda: a.analyze(body))


@router.post("/v1/skills/compare", response_model=SkillComparisonResponse, tags=["analysis"], responses=ERRORS)
async def compare_skills(request: Request, body: AnalyzeRequest) -> SkillComparisonResponse:
    a = _analyzer(request)
    return await run_limited(request, lambda: a.compare_skills(body))


@router.post("/v1/projects/relevance", response_model=ProjectRelevanceResponse, tags=["analysis"], responses=ERRORS)
async def project_relevance(request: Request, body: AnalyzeRequest) -> ProjectRelevanceResponse:
    a = _analyzer(request)
    return await run_limited(request, lambda: a.project_relevance(body))
