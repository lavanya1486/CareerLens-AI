import time

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.errors import ModelUnavailableError
from app.main import create_app
from tests.conftest import HashingEmbedder, make_text_pdf


def test_health_and_ready(client):
    h = client.get("/health").json()
    assert h["status"] == "ok" and h["model_loaded"] is True and h["scoring_version"] == "1.0.0"
    assert client.get("/ready").status_code == 200


def test_job_extract_endpoint(client, java_jd):
    r = client.post("/v1/job/extract", json={"job_description": java_jd})
    assert r.status_code == 200
    assert any(s["skill"] == "Spring Boot" for s in r.json()["skills"])


def test_job_extract_validation_errors(client):
    r = client.post("/v1/job/extract", json={"job_description": "too short"})
    assert r.status_code == 422 and r.json()["code"] == "JOB_DESCRIPTION_TOO_SHORT"
    r = client.post("/v1/job/extract", json={})
    assert r.status_code == 422 and r.json()["code"] == "VALIDATION_ERROR"


def test_validation_errors_do_not_echo_input(client):
    secret = "CONFIDENTIAL-RESUME-CONTENT"
    r = client.post("/v1/analyze", json={"resume_text": secret, "job_description": 123, "unexpected": secret})
    assert r.status_code == 422
    assert secret not in r.text


def test_analyze_endpoint(client, resume_text, java_jd):
    r = client.post("/v1/analyze", json={"resume_text": resume_text, "job_description": java_jd, "reference_date": "2026-10-01"})
    assert r.status_code == 200
    body = r.json()
    assert 0 <= body["overall_score"] <= 100
    assert {"skill_matches", "projects", "recommendations", "components", "methodology", "limitations"} <= set(body)


def test_analyze_rejects_short_resume_and_long_resume(client, java_jd):
    r = client.post("/v1/analyze", json={"resume_text": "Just a few words", "job_description": java_jd})
    assert r.status_code == 422 and r.json()["code"] == "RESUME_TOO_SHORT"
    r = client.post("/v1/analyze", json={"resume_text": "word " * 20000, "job_description": java_jd})
    assert r.status_code == 422 and r.json()["code"] == "RESUME_TOO_LONG"


def test_skills_and_projects_endpoints(client, resume_text, java_jd):
    body = {"resume_text": resume_text, "job_description": java_jd}
    s = client.post("/v1/skills/compare", json=body)
    assert s.status_code == 200 and s.json()["skill_matches"]
    p = client.post("/v1/projects/relevance", json=body)
    assert p.status_code == 200 and p.json()["projects"][0]["rank"] == 1


def test_resume_extract_and_parse(client, resume_text):
    r = client.post("/v1/resume/extract", files={"file": ("cv.pdf", make_text_pdf(resume_text), "application/pdf")})
    assert r.status_code == 200
    body = r.json()
    assert "Projects" in body["structure"]["detected"] and body["page_count"] == 1
    assert "Spring Boot" in body["structure"]["skills"]
    bad = client.post("/v1/resume/extract", files={"file": ("cv.pdf", b"not a pdf", "application/pdf")})
    assert bad.status_code == 415 and bad.json()["code"] == "NOT_A_PDF"
    p = client.post("/v1/resume/parse", json={"resume_text": resume_text})
    assert p.status_code == 200 and len(p.json()["projects"]) == 3


def test_upload_size_limit():
    settings = Settings(preload_model=False, max_upload_bytes=2048)
    with TestClient(create_app(settings, embedder=HashingEmbedder())) as c:
        r = c.post("/v1/resume/extract", files={"file": ("cv.pdf", b"%PDF-" + b"0" * 4096, "application/pdf")})
        assert r.status_code == 413


def test_internal_api_key_enforced():
    settings = Settings(preload_model=False, internal_api_key="s3cret-key")
    with TestClient(create_app(settings, embedder=HashingEmbedder())) as c:
        assert c.get("/health").status_code == 200
        assert c.post("/v1/job/extract", json={"job_description": "x"}).status_code == 401
        r = c.post("/v1/job/extract", json={"job_description": "x"}, headers={"X-Internal-Api-Key": "wrong"})
        assert r.status_code == 401
        r = c.post("/v1/job/extract", json={"job_description": "x"}, headers={"X-Internal-Api-Key": "s3cret-key"})
        assert r.status_code == 422


class BrokenEmbedder(HashingEmbedder):
    @property
    def loaded(self) -> bool:
        return False

    def encode(self, texts):
        raise ModelUnavailableError("The semantic analysis model is not available right now.")


class SlowEmbedder(HashingEmbedder):
    def encode(self, texts):
        time.sleep(2)
        return super().encode(texts)


def test_model_unavailable_returns_503_without_fabricated_result(resume_text, java_jd):
    with TestClient(create_app(Settings(preload_model=False), embedder=BrokenEmbedder())) as c:
        assert c.get("/ready").status_code == 503
        assert c.get("/health").json()["status"] == "degraded"
        r = c.post("/v1/analyze", json={"resume_text": resume_text, "job_description": java_jd})
        assert r.status_code == 503 and r.json()["code"] == "MODEL_UNAVAILABLE"
        assert "overall_score" not in r.text


def test_inference_timeout_returns_504(resume_text, java_jd):
    settings = Settings(preload_model=False, inference_timeout_seconds=0.3)
    with TestClient(create_app(settings, embedder=SlowEmbedder())) as c:
        r = c.post("/v1/analyze", json={"resume_text": resume_text, "job_description": java_jd})
        assert r.status_code == 504 and r.json()["code"] == "INFERENCE_TIMEOUT"


def test_missing_model_files_in_offline_mode_raise_unavailable(tmp_path):
    from app.nlp.embeddings import FastEmbedEmbedder

    emb = FastEmbedEmbedder("sentence-transformers/all-MiniLM-L6-v2", str(tmp_path / "empty-cache"), offline=True)
    with pytest.raises(ModelUnavailableError):
        emb.load()
    assert emb.loaded is False and emb.load_error
