"""Shared fixtures: synthetic documents, PDF builders and a deterministic test embedder."""

from __future__ import annotations

import hashlib
import io
import re
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app.config import Settings
from app.main import create_app
from app.nlp.analyzer import Analyzer
from app.nlp.scoring import load_scoring_config
from app.nlp.taxonomy import load_taxonomy

ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / "demo-data"


class HashingEmbedder:
    """Deterministic bag-of-words embedder used to unit-test logic without the ONNX model.

    It is ONLY used in tests; production always uses the real sentence-embedding model.
    """

    name = "test-hashing-embedder"
    provider = "test"
    dimension = 384

    def __init__(self) -> None:
        self.calls = 0

    @property
    def loaded(self) -> bool:
        return True

    def encode(self, texts: list[str]) -> np.ndarray:
        self.calls += 1
        out = np.zeros((len(texts), self.dimension), dtype=np.float32)
        for i, t in enumerate(texts):
            for tok in re.findall(r"[a-z0-9+#]+", t.lower()):
                h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
                out[i, h % self.dimension] += 1.0
            n = np.linalg.norm(out[i])
            if n:
                out[i] /= n
        return out


@pytest.fixture(scope="session")
def taxonomy():
    return load_taxonomy(Settings().taxonomy_path)


@pytest.fixture(scope="session")
def scoring():
    return load_scoring_config()


@pytest.fixture()
def settings() -> Settings:
    return Settings(preload_model=False, internal_api_key="", environment="test")


@pytest.fixture()
def analyzer(taxonomy, scoring, settings) -> Analyzer:
    return Analyzer(HashingEmbedder(), taxonomy, scoring, settings)


@pytest.fixture()
def client(settings) -> TestClient:
    app = create_app(settings, embedder=HashingEmbedder())
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def resume_text() -> str:
    return (DEMO / "resume-ananya-rao.txt").read_text()


@pytest.fixture(scope="session")
def java_jd() -> str:
    return (DEMO / "job-java-backend-intern.txt").read_text()


@pytest.fixture(scope="session")
def ml_jd() -> str:
    return (DEMO / "job-ml-engineer.txt").read_text()


def make_text_pdf(text: str, pages: int = 1) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    lines = text.split("\n")
    for _ in range(pages):
        y = 800
        for line in lines:
            c.drawString(40, y, line[:110])
            y -= 14
            if y < 40:
                c.showPage()
                y = 800
        c.showPage()
    c.save()
    return buf.getvalue()


def make_image_only_pdf() -> bytes:
    from reportlab.lib.utils import ImageReader
    from PIL import Image

    img = Image.new("RGB", (400, 200), color=(240, 240, 240))
    ib = io.BytesIO()
    img.save(ib, format="PNG")
    ib.seek(0)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.drawImage(ImageReader(ib), 50, 500, width=400, height=200)
    c.showPage()
    c.save()
    return buf.getvalue()


def make_encrypted_pdf(text: str) -> bytes:
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(io.BytesIO(make_text_pdf(text)))
    writer = PdfWriter()
    for p in reader.pages:
        writer.add_page(p)
    writer.encrypt(user_password="secret-pass", owner_password="owner-pass", algorithm="RC4-128")
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
