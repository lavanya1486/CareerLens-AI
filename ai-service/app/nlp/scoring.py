"""Versioned, configurable and explainable scoring engine."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.config import DATA_DIR
from app.schemas import ComponentScore

COMPONENT_LABELS = {
    "required_skills": "Required skill coverage",
    "preferred_skills": "Preferred skill coverage",
    "semantic": "Semantic similarity",
    "projects": "Project relevance",
    "experience": "Experience & responsibility alignment",
    "evidence": "Evidence strength",
}
COMPONENT_ORDER = list(COMPONENT_LABELS)


@dataclass(frozen=True)
class ScoringConfig:
    version: str
    weights: dict[str, float]
    partial_credit: float
    preferred_requirement_weight: float
    evidence_strength: dict[str, float]
    similarity_floor: float
    similarity_ceiling: float
    strong_similarity: float
    moderate_similarity: float
    semantic_hint_similarity: float
    project_skill_weight: float
    project_semantic_weight: float
    project_top_k_statements: int
    project_union_top_n: int
    experience_responsibility_weight: float
    experience_years_weight: float

    def __post_init__(self) -> None:
        if set(self.weights) != set(COMPONENT_ORDER):
            raise ValueError(f"weights must define exactly {COMPONENT_ORDER}")
        if any(w < 0 for w in self.weights.values()) or abs(sum(self.weights.values()) - 1.0) > 1e-6:
            raise ValueError("weights must be non-negative and sum to 1.0")
        if not 0 <= self.partial_credit < 1:
            raise ValueError("partial_credit must be in [0, 1)")
        if not self.similarity_floor < self.similarity_ceiling:
            raise ValueError("similarity_floor must be below similarity_ceiling")

    def calibrate(self, cosine: float) -> float:
        """Map a raw cosine similarity to [0, 1] with a documented linear rescale.

        MiniLM cosine scores for unrelated text cluster around 0.0-0.2 and closely
        related statements typically reach 0.6-0.8, so values are rescaled between
        ``similarity_floor`` and ``similarity_ceiling`` and clamped.
        """
        span = self.similarity_ceiling - self.similarity_floor
        return float(min(1.0, max(0.0, (cosine - self.similarity_floor) / span)))

    def classify(self, cosine: float) -> str:
        if cosine >= self.strong_similarity:
            return "strong"
        if cosine >= self.moderate_similarity:
            return "moderate"
        return "weak"


def config_from_dict(raw: dict) -> ScoringConfig:
    fields = {k: raw[k] for k in ScoringConfig.__dataclass_fields__}
    return ScoringConfig(**fields)


@lru_cache(maxsize=4)
def load_scoring_config(path: str | None = None) -> ScoringConfig:
    p = Path(path) if path else DATA_DIR / "scoring_config.json"
    with p.open(encoding="utf-8") as fh:
        return config_from_dict(json.load(fh))


@dataclass
class ComponentInput:
    key: str
    score: float  # 0..1
    available: bool
    explanation: str


def combine(components: list[ComponentInput], config: ScoringConfig) -> tuple[float, list[ComponentScore], list[str]]:
    """Weighted sum of component scores with renormalisation over available components.

    Components that cannot be computed (e.g. no preferred skills in the posting) are
    excluded and their weight is redistributed proportionally, so missing information
    neither inflates nor deflates the score.
    """
    by_key = {c.key: c for c in components}
    available_weight = sum(config.weights[k] for k in COMPONENT_ORDER if by_key[k].available)
    results: list[ComponentScore] = []
    total = 0.0
    lines: list[str] = []
    for key in COMPONENT_ORDER:
        c = by_key[key]
        w = config.weights[key]
        eff = (w / available_weight) if (c.available and available_weight > 0) else 0.0
        score100 = round(max(0.0, min(1.0, c.score)) * 100, 1) if c.available else 0.0
        contribution = round(score100 * eff, 2)
        total += score100 * eff
        results.append(ComponentScore(
            key=key, label=COMPONENT_LABELS[key], score=score100, weight=w, effective_weight=round(eff, 4),
            contribution=contribution, available=c.available, explanation=c.explanation,
        ))
        if c.available:
            lines.append(f"{COMPONENT_LABELS[key]}: {score100:.1f} × {eff:.3f} = {contribution:.2f}")
        else:
            lines.append(f"{COMPONENT_LABELS[key]}: not applicable (weight {w:.2f} redistributed)")
    overall = round(max(0.0, min(100.0, total)), 1)
    lines.append(f"Overall alignment = sum of contributions = {overall:.1f} / 100")
    return overall, results, lines


def score_band(score: float) -> str:
    if score >= 75:
        return "strong"
    if score >= 55:
        return "good"
    if score >= 35:
        return "partial"
    return "limited"
