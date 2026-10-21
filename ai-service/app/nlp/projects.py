"""Project relevance ranking with grounded explanations."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.nlp.embeddings import EmbeddingCache, cosine_matrix
from app.nlp.job import JobUnit
from app.nlp.resume import Entry
from app.nlp.scoring import ScoringConfig
from app.nlp.skills import LineRef, extract_from_lines
from app.nlp.taxonomy import Taxonomy
from app.nlp.text import truncate
from app.schemas import MatchedRequirement, ProjectAnalysis, RelatedStatement, RequirementSkill

FUTURE_TEMPLATES = {
    "testing": "add automated tests with {skill} and report what they cover",
    "devops": "package or deploy it with {skill}",
    "cloud": "deploy it on {skill} and document the setup",
    "database": "persist its data in {skill}",
    "concept": "apply {skill} where it genuinely fits the design",
    "tool": "use {skill} in the development workflow",
    "framework": "extend it with a feature built on {skill}",
    "library": "extend it with a feature built on {skill}",
    "language": "implement a component in {skill}",
    "ai_ml": "add a feature that uses {skill}",
    "methodology": "run it with {skill} practices and describe them",
}


@dataclass
class ProjectComputation:
    analyses: list[ProjectAnalysis]
    component_score: float  # 0..1
    explanation: str
    union_matched: list[str]


def _req_weight(req: RequirementSkill, config: ScoringConfig) -> float:
    return 1.0 if req.importance == "required" else config.preferred_requirement_weight


def analyze_projects(projects: list[Entry], requirements: list[RequirementSkill], units: list[JobUnit],
                     cache: EmbeddingCache, taxonomy: Taxonomy, config: ScoringConfig) -> ProjectComputation:
    if not projects:
        return ProjectComputation([], 0.0, "No projects section was detected, so there is no project evidence to score.", [])

    total_weight = sum(_req_weight(r, config) for r in requirements) or 0.0
    unit_texts = [u.text for u in units]
    unit_matrix = cache.matrix(unit_texts) if unit_texts else None
    drafts: list[dict] = []
    for p in projects:
        refs = [LineRef(section="projects", text=t, index=i) for i, t in enumerate([p.header, *p.body])]
        hits = extract_from_lines(refs, taxonomy)
        confirmed = {n: h for n, h in hits.items() if h.is_confirmed}
        technologies = sorted((n for n, h in confirmed.items() if h.skill.is_technical), key=str.lower)
        matched: list[RequirementSkill] = []
        for r in requirements:
            members = [r.skill, *r.alternatives]
            if any(m in confirmed for m in members) or (r.custom and any(r.skill.lower() in ln.text.lower() for ln in refs)):
                matched.append(r)
        matched_weight = sum(_req_weight(r, config) for r in matched)
        skill_cov = matched_weight / total_weight if total_weight else 0.0

        sem = 0.0
        related: list[RelatedStatement] = []
        if unit_matrix is not None and len(unit_texts):
            proj_units = p.units
            sims = cosine_matrix(unit_matrix, cache.matrix(proj_units))  # (jd_units, project_units)
            best_per_unit = sims.max(axis=1)
            k = min(config.project_top_k_statements, len(best_per_unit))
            top_idx = np.argsort(-best_per_unit, kind="stable")[:k]
            sem = config.calibrate(float(np.mean(best_per_unit[top_idx])))
            related = [RelatedStatement(text=truncate(unit_texts[i], 200), similarity=round(float(best_per_unit[i]), 4))
                       for i in top_idx if best_per_unit[i] >= config.moderate_similarity]

        relevance = config.project_skill_weight * skill_cov + config.project_semantic_weight * sem
        evidence_lines = [b for b in p.body if any(m.lower() in b.lower() for r in matched for m in [r.skill, *r.alternatives])]
        if not evidence_lines:
            evidence_lines = p.body[:2]
        missing_required = [r.skill for r in requirements if r.importance == "required" and r not in matched]
        uncertainty = []
        if len(p.body) < 2:
            uncertainty.append("The project description is short, which limits how much evidence could be analysed.")
        drafts.append({
            "entry": p, "relevance": relevance, "skill_cov": skill_cov, "sem": sem, "technologies": technologies,
            "matched": matched, "related": related, "evidence": [truncate(e, 240) for e in evidence_lines[:3]],
            "missing_required": missing_required, "uncertainty": uncertainty,
        })

    drafts.sort(key=lambda d: (-round(d["relevance"], 6), d["entry"].title.lower()))
    analyses: list[ProjectAnalysis] = []
    for rank, d in enumerate(drafts, start=1):
        analyses.append(_build_analysis(rank, d, requirements, taxonomy))

    top = drafts[: config.project_union_top_n]
    union = {r.skill: r for d in top for r in d["matched"]}
    union_cov = (sum(_req_weight(r, config) for r in union.values()) / total_weight) if total_weight else 0.0
    best_sem = max(d["sem"] for d in drafts)
    component = config.project_skill_weight * union_cov + config.project_semantic_weight * best_sem
    explanation = (
        f"Your top {len(top)} project(s) together demonstrate {len(union)} of {len(requirements)} skill requirements "
        f"({union_cov * 100:.0f}% weighted coverage); the most aligned project has a semantic score of {best_sem * 100:.0f}. "
        f"Score = {config.project_skill_weight:.1f} × coverage + {config.project_semantic_weight:.1f} × semantic."
    )
    return ProjectComputation(analyses, component, explanation, sorted(union, key=str.lower))


def _build_analysis(rank: int, d: dict, requirements: list[RequirementSkill], taxonomy: Taxonomy) -> ProjectAnalysis:
    p: Entry = d["entry"]
    matched: list[RequirementSkill] = d["matched"]
    req_matched = [r.skill for r in matched if r.importance == "required"]
    pref_matched = [r.skill for r in matched if r.importance == "preferred"]
    total_req = sum(1 for r in requirements if r.importance == "required")
    parts = []
    if req_matched:
        parts.append(f"demonstrates {len(req_matched)} of {total_req} required skills ({', '.join(req_matched[:5])})")
    if pref_matched:
        parts.append(f"covers preferred skills {', '.join(pref_matched[:3])}")
    if d["related"]:
        parts.append(f"its description closely matches {len(d['related'])} job statement(s), e.g. \"{truncate(d['related'][0].text, 90)}\"")
    if parts:
        explanation = f"Ranked #{rank} because it " + "; ".join(parts) + "."
    else:
        explanation = (f"Ranked #{rank}: this project shows little overlap with the posting's skill requirements and "
                       "its description is not closely related to the listed responsibilities.")

    missing_evidence = [f"No evidence of {s} in this project." for s in d["missing_required"][:4]]
    missing_evidence += d["uncertainty"]
    future: list[str] = []
    if d["technologies"] or matched:
        for skill_name in d["missing_required"]:
            sd = taxonomy.get(skill_name)
            template = FUTURE_TEMPLATES.get(sd.category if sd else "", "incorporate {skill} where it genuinely fits")
            future.append(f"Possible future enhancement: {template.format(skill=skill_name)}. Only list it after you have built it.")
            if len(future) >= 3:
                break
    return ProjectAnalysis(
        rank=rank, name=p.title, header=truncate(p.header, 200), relevance_score=round(d["relevance"] * 100, 1),
        skill_coverage_score=round(d["skill_cov"] * 100, 1), semantic_score=round(d["sem"] * 100, 1),
        technologies=d["technologies"],
        matched_requirements=[MatchedRequirement(skill=r.skill, importance=r.importance) for r in matched],
        related_statements=d["related"], evidence=d["evidence"], missing_evidence=missing_evidence,
        explanation=explanation, future_improvements=future,
    )
