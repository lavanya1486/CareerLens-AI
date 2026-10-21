"""Tests that exercise the real ONNX sentence-embedding model (all-MiniLM-L6-v2)."""

from datetime import date

import numpy as np
import pytest

from app.config import Settings
from app.nlp.analyzer import Analyzer
from app.nlp.embeddings import FastEmbedEmbedder, cosine_matrix
from app.schemas import AnalyzeRequest

pytestmark = pytest.mark.model


@pytest.fixture(scope="module")
def embedder():
    s = Settings()
    e = FastEmbedEmbedder(s.embedding_model, s.model_cache_dir, threads=1)
    e.load()
    return e


def test_semantic_similarity_ranks_related_text_higher(embedder):
    v = embedder.encode([
        "Develop RESTful web services using Spring Boot",
        "Built REST endpoints in Java with the Spring framework",
        "Organised a charity bake sale for the local school",
    ])
    sims = cosine_matrix(v[:1], v[1:])[0]
    assert sims[0] > sims[1] + 0.2
    assert v.shape[1] == 384
    assert np.allclose(np.linalg.norm(v, axis=1), 1.0, atol=1e-4)


def test_real_model_analysis_is_deterministic(embedder, taxonomy, scoring, resume_text, java_jd):
    analyzer = Analyzer(embedder, taxonomy, scoring, Settings())
    req = AnalyzeRequest(resume_text=resume_text, job_description=java_jd, reference_date=date(2026, 10, 1))
    a, b = analyzer.analyze(req), analyzer.analyze(req)
    assert a.overall_score == b.overall_score
    assert a.model_dump() == b.model_dump()
    assert a.model.name == "sentence-transformers/all-MiniLM-L6-v2"


def test_relevant_resume_scores_higher_than_unrelated_job(embedder, taxonomy, scoring, resume_text, java_jd, ml_jd):
    analyzer = Analyzer(embedder, taxonomy, scoring, Settings())
    java = analyzer.analyze(AnalyzeRequest(resume_text=resume_text, job_description=java_jd, reference_date=date(2026, 10, 1)))
    ml = analyzer.analyze(AnalyzeRequest(resume_text=resume_text, job_description=ml_jd, reference_date=date(2026, 10, 1)))
    assert java.overall_score > ml.overall_score
    assert ml.experience.status == "not_met"
