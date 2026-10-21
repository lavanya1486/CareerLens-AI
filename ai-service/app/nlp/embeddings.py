"""Sentence embedding generation and cosine similarity.

The production embedder runs ``sentence-transformers/all-MiniLM-L6-v2`` locally as an
ONNX model through fastembed (384-dimensional vectors, ~90 MB on disk). The model is
loaded once per process and reused by every request.
"""

from __future__ import annotations

import logging
import threading
from typing import Protocol

import numpy as np

from app.errors import InferenceError, ModelUnavailableError

log = logging.getLogger(__name__)


class Embedder(Protocol):
    name: str
    provider: str
    dimension: int

    @property
    def loaded(self) -> bool: ...

    def encode(self, texts: list[str]) -> np.ndarray: ...


def normalize_rows(matrix: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return matrix / norms


def cosine_matrix(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Cosine similarity between every row of ``a`` and every row of ``b``."""
    if a.size == 0 or b.size == 0:
        return np.zeros((a.shape[0] if a.ndim == 2 else 0, b.shape[0] if b.ndim == 2 else 0), dtype=np.float32)
    return np.clip(normalize_rows(a) @ normalize_rows(b).T, -1.0, 1.0)


class FastEmbedEmbedder:
    """Thread-safe lazy wrapper around a fastembed ``TextEmbedding`` model."""

    provider = "fastembed (ONNX Runtime, local CPU inference)"

    def __init__(self, model_name: str, cache_dir: str, threads: int = 1, offline: bool = False) -> None:
        self.name = model_name
        self.dimension = 384
        self._cache_dir = cache_dir
        self._threads = threads
        self._offline = offline
        self._model = None
        self._lock = threading.Lock()
        self._load_error: str | None = None

    @property
    def loaded(self) -> bool:
        return self._model is not None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    def load(self) -> None:
        if self._model is not None:
            return
        with self._lock:
            if self._model is not None:
                return
            try:
                from fastembed import TextEmbedding

                kwargs: dict = {"cache_dir": self._cache_dir, "threads": self._threads}
                if self._offline:
                    kwargs["local_files_only"] = True
                model = TextEmbedding(self.name, **kwargs)
                probe = np.asarray(list(model.embed(["warm-up"])), dtype=np.float32)
                self.dimension = int(probe.shape[1])
                self._model = model
                self._load_error = None
                log.info("embedding_model_loaded model=%s dimension=%d", self.name, self.dimension)
            except Exception as exc:  # noqa: BLE001 - surface any loader failure as unavailability
                self._load_error = type(exc).__name__
                log.error("embedding_model_load_failed model=%s error_type=%s", self.name, type(exc).__name__)
                raise ModelUnavailableError(
                    "The semantic analysis model is not available right now. No analysis was produced; please retry shortly."
                ) from exc

    def encode(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dimension), dtype=np.float32)
        if self._model is None:
            self.load()
        try:
            vectors = np.asarray(list(self._model.embed(texts, batch_size=32)), dtype=np.float32)  # type: ignore[union-attr]
        except Exception as exc:  # noqa: BLE001
            log.error("embedding_inference_failed error_type=%s count=%d", type(exc).__name__, len(texts))
            raise InferenceError("Semantic inference failed. No analysis was produced.") from exc
        return normalize_rows(vectors)


class EmbeddingCache:
    """Per-request de-duplication so identical text is encoded only once."""

    def __init__(self, embedder: Embedder) -> None:
        self._embedder = embedder
        self._vectors: dict[str, np.ndarray] = {}

    def prime(self, texts: list[str]) -> None:
        missing = list(dict.fromkeys(t for t in texts if t and t not in self._vectors))
        if not missing:
            return
        vecs = self._embedder.encode(missing)
        for t, v in zip(missing, vecs, strict=True):
            self._vectors[t] = v

    def matrix(self, texts: list[str]) -> np.ndarray:
        self.prime(texts)
        if not texts:
            return np.zeros((0, self._embedder.dimension), dtype=np.float32)
        return np.stack([self._vectors[t] for t in texts])
