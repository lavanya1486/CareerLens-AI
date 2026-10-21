"""End-to-end analysis orchestration: parsing, matching, embeddings, scoring, explanations."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date

import numpy as np

from app.config import Settings
from app.errors import InvalidInputError
from app.nlp.embeddings import Embedder, EmbeddingCache, cosine_matrix
from app.nlp.job import JobUnit, ParsedJob, apply_overrides, parse_job_description
from app.nlp.matching import (
    SECTION_PRIORITY,
    evidence_from_line,
    match_requirement,
    resume_skill_list,
)
from app.nlp.projects import analyze_projects
from app.nlp.recommendations import build_recommendations
from app.nlp.resume import SECTION_LABELS, ResumeDocument, estimate_experience_months, find_date_ranges, parse_resume
from app.nlp.scoring import ComponentInput, ScoringConfig, combine, score_band
from app.nlp.skills import LineRef, extract_from_lines
from app.nlp.taxonomy import Taxonomy
from app.nlp.text import strip_bullet, truncate, word_count
from app.schemas import (
    Alignment,
    AnalysisResult,
    AnalyzeRequest,
    CompetencyCheck,
    Evidence,
    ExperienceAnalysis,
    MethodologyNote,
    ModelInfo,
    ProjectRelevanceResponse,
    QualificationCheck,
    RequirementSkill,
    ResumeEntrySummary,
    ResumeSection,
    ResumeStructure,
    SectionInfo,
    SkillComparisonResponse,
    SkillMatch,
)

ANALYSIS_VERSION = "2026.10"
MIN_RESUME_WORDS = 30

LIMITATIONS = [
    "The score measures how well the resume text aligns with this job description. It is not a probability of being "
    "interviewed or hired.",
    "Skills are recognised from a curated taxonomy. Technologies outside the taxonomy are only matched when you add them "
    "as custom requirements.",
    "A skill that is missing from the resume does not mean the candidate lacks it - only that the document does not show it.",
    "Semantic similarity (all-MiniLM-L6-v2) measures how related two pieces of text are, not competence. Passages longer "
    "than ~256 word pieces are truncated by the model.",
    "Experience duration is estimated from date ranges found in the experience section and may be inaccurate for unusual "
    "date formats.",
    "Education and certification requirements are reported for manual review and are not part of the numeric score.",
    "The analysis is designed for English-language resumes and job descriptions.",
]


def methodology_notes(config: ScoringConfig) -> list[MethodologyNote]:
    w = config.weights
    return [
        MethodologyNote(title="Keyword matching vs. semantic similarity", body=(
            "Keyword matching recognises explicit skills (with aliases such as 'Postgres' → PostgreSQL) and is the only way a "
            "skill is credited. Semantic similarity compares the meaning of sentences using a sentence-embedding model and "
            "cosine similarity, so 'built REST endpoints' can align with 'develop RESTful services' even without shared "
            "keywords. Semantic similarity informs alignment scores but never credits a specific skill on its own.")),
        MethodologyNote(title="Component weights", body=(
            f"Required skills {w['required_skills']:.0%}, preferred skills {w['preferred_skills']:.0%}, semantic similarity "
            f"{w['semantic']:.0%}, project relevance {w['projects']:.0%}, experience alignment {w['experience']:.0%}, evidence "
            f"strength {w['evidence']:.0%}. Components that do not apply are excluded and their weight is redistributed "
            "proportionally.")),
        MethodologyNote(title="Credit rules", body=(
            f"Each requirement counts once. An explicit match earns full credit; a related but distinct technology earns "
            f"{config.partial_credit:.0%} partial credit; ambiguous or missing evidence earns none. Preferred requirements "
            f"count {config.preferred_requirement_weight:.0%} as much as required ones where they are combined. 'A or B' "
            "requirements are satisfied by either option.")),
        MethodologyNote(title="Similarity calibration", body=(
            f"Raw cosine similarities are linearly rescaled from [{config.similarity_floor}, {config.similarity_ceiling}] to "
            f"[0, 100] and clamped. Statements are classed as strong (≥ {config.strong_similarity}), moderate "
            f"(≥ {config.moderate_similarity}) or weak alignment.")),
        MethodologyNote(title="Determinism and versioning", body=(
            f"Results are deterministic for the same inputs, model, taxonomy and scoring version {config.version}. The "
            "version identifiers are stored with every saved analysis so older reports remain interpretable.")),
    ]


@dataclass
class AnalysisContext:
    resume: ResumeDocument
    resume_lines: list[LineRef]
    job: ParsedJob
    requirements: list[RequirementSkill]


class Analyzer:
    def __init__(self, embedder: Embedder, taxonomy: Taxonomy, config: ScoringConfig, settings: Settings) -> None:
        self.embedder = embedder
        self.taxonomy = taxonomy
        self.config = config
        self.settings = settings

    # ------------------------------------------------------------ helpers
    def model_info(self) -> ModelInfo:
        return ModelInfo(name=self.embedder.name, provider=self.embedder.provider, dimension=self.embedder.dimension)

    def parse_job(self, text: str) -> ParsedJob:
        return parse_job_description(text, self.taxonomy, max_chars=self.settings.max_job_description_chars,
                                     min_words=self.settings.min_job_description_words)

    def parse_resume_text(self, text: str) -> ResumeDocument:
        if len(text) > self.settings.max_resume_chars:
            raise InvalidInputError(
                f"The resume text is too long ({len(text):,} characters). The limit is {self.settings.max_resume_chars:,}.",
                code="RESUME_TOO_LONG",
            )
        doc = parse_resume(text)
        if word_count(doc.text) < MIN_RESUME_WORDS:
            raise InvalidInputError(
                f"The resume text is too short to analyse (minimum {MIN_RESUME_WORDS} words).", code="RESUME_TOO_SHORT"
            )
        return doc

    def resume_structure(self, doc: ResumeDocument) -> ResumeStructure:
        hits = extract_from_lines(doc.lines(), self.taxonomy)
        return ResumeStructure(
            sections=[ResumeSection(key=s.key, label=SECTION_LABELS.get(s.key, s.key), heading=s.heading, text=s.text)
                      for s in doc.sections],
            detected=[SECTION_LABELS.get(k, k) for k in doc.section_keys()],
            missing=[SECTION_LABELS[k] for k in doc.missing_core_sections()],
            projects=[ResumeEntrySummary(title=e.title, section=e.section, lines=len(e.body)) for e in doc.projects],
            experience=[ResumeEntrySummary(title=e.title, section=e.section, lines=len(e.body)) for e in doc.experience],
            skills=sorted((n for n, h in hits.items() if h.is_confirmed), key=str.lower),
            word_count=word_count(doc.text),
        )

    def _context(self, req: AnalyzeRequest) -> AnalysisContext:
        resume = self.parse_resume_text(req.resume_text)
        job = self.parse_job(req.job_description)
        requirements = apply_overrides(job, req.requirements, self.taxonomy) if req.requirements is not None \
            else list(job.requirements.skills)
        return AnalysisContext(resume=resume, resume_lines=resume.lines(), job=job, requirements=requirements)

    def _resume_units(self, lines: list[LineRef], sections: set[str] | None = None) -> list[tuple[str, LineRef]]:
        units: list[tuple[str, LineRef]] = []
        seen: set[str] = set()
        for ln in lines:
            if ln.section == "header" or (sections is not None and ln.section not in sections):
                continue
            text = strip_bullet(ln.text)
            if word_count(text) < 3 or text.lower() in seen:
                continue
            seen.add(text.lower())
            units.append((text, ln))
        return units[: self.settings.max_embedding_units]

    # ------------------------------------------------------------ skills
    def _match_skills(self, ctx: AnalysisContext) -> tuple[list[SkillMatch], dict]:
        hits = extract_from_lines(ctx.resume_lines, self.taxonomy)
        matches = [match_requirement(r, hits, ctx.resume_lines, self.taxonomy, self.config) for r in ctx.requirements]
        return matches, hits

    def compare_skills(self, req: AnalyzeRequest) -> SkillComparisonResponse:
        ctx = self._context(req)
        matches, hits = self._match_skills(ctx)
        reqs = ctx.job.requirements.model_copy(update={"skills": ctx.requirements})
        return SkillComparisonResponse(taxonomy_version=self.taxonomy.version, requirements=reqs, skill_matches=matches,
                                       resume_skills=resume_skill_list(hits))

    def project_relevance(self, req: AnalyzeRequest) -> ProjectRelevanceResponse:
        ctx = self._context(req)
        cache = EmbeddingCache(self.embedder)
        units = ctx.job.units[: self.settings.max_embedding_units]
        proj = analyze_projects(ctx.resume.projects, ctx.requirements, units, cache, self.taxonomy, self.config)
        recs = [r for r in build_recommendations([], proj.analyses, [], ExperienceAnalysis(
            status="not_required", required_min_years=None, estimated_months=None, date_ranges=[], explanation=""),
            ctx.resume, ctx.requirements, ctx.job.requirements.responsibilities) if r.category == "project"]
        return ProjectRelevanceResponse(model=self.model_info(), projects=proj.analyses, recommendations=recs)

    # ------------------------------------------------------------ full analysis
    def analyze(self, req: AnalyzeRequest) -> AnalysisResult:
        cfg = self.config
        ctx = self._context(req)
        reference = req.reference_date or date.today()
        matches, hits = self._match_skills(ctx)

        units: list[JobUnit] = ctx.job.units[: self.settings.max_embedding_units]
        resume_units = self._resume_units(ctx.resume_lines)
        content_units = self._resume_units(ctx.resume_lines, {"experience", "projects"})

        cache = EmbeddingCache(self.embedder)
        missing_evidence_lines = [m.job_evidence for m in matches if m.status == "missing"]
        cache.prime([u.text for u in units] + [t for t, _ in resume_units] + missing_evidence_lines
                    + [t for p in ctx.resume.projects for t in p.units])

        # Semantic alignment of every job statement against the resume.
        alignments: list[Alignment] = []
        resume_matrix = cache.matrix([t for t, _ in resume_units])
        unit_matrix = cache.matrix([u.text for u in units])
        if len(resume_units) and len(units):
            sims = cosine_matrix(unit_matrix, resume_matrix)
            for i, u in enumerate(units):
                j = int(np.argmax(sims[i]))
                s = round(float(sims[i, j]), 4)
                alignments.append(Alignment(
                    requirement=truncate(u.text, 300), kind=u.kind, importance=u.importance,
                    best_evidence=evidence_from_line(resume_units[j][1]), similarity=s,
                    score=round(cfg.calibrate(s) * 100, 1), classification=cfg.classify(s),
                ))
        else:
            for u in units:
                alignments.append(Alignment(requirement=truncate(u.text, 300), kind=u.kind, importance=u.importance,
                                            best_evidence=None, similarity=0.0, score=0.0, classification="weak"))

        # Semantic hints for missing skills - displayed for review, never credited.
        if missing_evidence_lines and len(resume_units):
            hint_sims = cosine_matrix(cache.matrix(missing_evidence_lines), resume_matrix)
            k = 0
            for idx, m in enumerate(matches):
                if m.status != "missing":
                    continue
                row = hint_sims[k]
                k += 1
                j = int(np.argmax(row))
                if float(row[j]) >= cfg.semantic_hint_similarity:
                    matches[idx] = m.model_copy(update={
                        "semantic_hint": evidence_from_line(resume_units[j][1]),
                        "semantic_similarity": round(float(row[j]), 4),
                    })

        # Components ---------------------------------------------------------
        req_matches = [m for m in matches if m.importance == "required"]
        pref_matches = [m for m in matches if m.importance == "preferred"]

        def coverage(ms: list[SkillMatch]) -> float:
            return sum(m.credit for m in ms) / len(ms) if ms else 0.0

        def coverage_text(ms: list[SkillMatch], kind: str) -> str:
            full = sum(1 for m in ms if m.status == "matched")
            part = sum(1 for m in ms if m.status == "partial")
            return (f"{full} of {len(ms)} {kind} skills matched explicitly"
                    + (f", {part} partially ({cfg.partial_credit:.0%} credit each)" if part else "") + ".")

        req_units = [a for a in alignments if a.kind == "requirement"] or alignments
        semantic_score = float(np.mean([cfg.calibrate(a.similarity) for a in req_units])) if req_units else 0.0
        resp_units = [u for u in units if u.kind == "responsibility"]

        resp_alignment = 0.0
        if resp_units and content_units:
            rs = cosine_matrix(cache.matrix([u.text for u in resp_units]), cache.matrix([t for t, _ in content_units]))
            resp_alignment = float(np.mean([cfg.calibrate(float(v)) for v in rs.max(axis=1)]))

        experience = self._experience(ctx, reference)
        years_factor: float | None = None
        if experience.status == "met":
            years_factor = 1.0
        elif experience.status == "not_met" and experience.required_min_years:
            years_factor = min(1.0, (experience.estimated_months or 0) / (experience.required_min_years * 12))
        if resp_units and years_factor is not None:
            exp_score = cfg.experience_responsibility_weight * resp_alignment + cfg.experience_years_weight * years_factor
            exp_text = (f"Responsibility alignment {resp_alignment * 100:.0f} (weight {cfg.experience_responsibility_weight}) "
                        f"combined with experience-duration fit {years_factor * 100:.0f} (weight {cfg.experience_years_weight}).")
        elif resp_units:
            exp_score = resp_alignment
            exp_text = (f"Average best-match similarity between {len(resp_units)} job responsibilities and your experience/"
                        f"project bullets: {resp_alignment * 100:.0f}." + ("" if content_units else
                        " No experience or project bullets were found, so this is 0."))
        elif years_factor is not None:
            exp_score = years_factor
            exp_text = f"Experience-duration fit only (no responsibilities listed): {years_factor * 100:.0f}."
        else:
            exp_score = 0.0
            exp_text = "The posting lists no responsibilities or experience duration, so this component does not apply."

        proj = analyze_projects(ctx.resume.projects, ctx.requirements, units, cache, self.taxonomy, cfg)

        evidence_weights = []
        for m in matches:
            if m.status != "matched":
                continue
            w = 1.0 if m.importance == "required" else cfg.preferred_requirement_weight
            evidence_weights.append((w, cfg.evidence_strength.get(m.evidence_strength, 0.0)))
        evidence_score = (sum(w * s for w, s in evidence_weights) / sum(w for w, _ in evidence_weights)) if evidence_weights else 0.0
        demonstrated = sum(1 for m in matches if m.status == "matched" and m.evidence_strength == "demonstrated")
        matched_total = sum(1 for m in matches if m.status == "matched")

        components = [
            ComponentInput("required_skills", coverage(req_matches), bool(req_matches),
                           coverage_text(req_matches, "required") if req_matches else "The posting lists no required technical skills."),
            ComponentInput("preferred_skills", coverage(pref_matches), bool(pref_matches),
                           coverage_text(pref_matches, "preferred") if pref_matches else "The posting lists no preferred skills."),
            ComponentInput("semantic", semantic_score, bool(req_units) and bool(resume_units),
                           f"Average calibrated similarity between {len(req_units)} job requirement statements and their "
                           f"closest resume line: {semantic_score * 100:.0f}."),
            ComponentInput("projects", proj.component_score, True, proj.explanation),
            ComponentInput("experience", exp_score, bool(resp_units) or years_factor is not None, exp_text),
            ComponentInput("evidence", evidence_score, bool(matches),
                           (f"{demonstrated} of {matched_total} matched skills are demonstrated in projects or experience; "
                            "skills only listed in a skills section count for less.") if matches else
                           "No skill requirements to evaluate evidence for."),
        ]
        overall, component_scores, calc = combine(components, cfg)

        qualifications = self._qualifications(ctx)
        competencies = self._competencies(ctx, hits)
        recommendations = build_recommendations(matches, proj.analyses, alignments, experience, ctx.resume,
                                                ctx.requirements, ctx.job.requirements.responsibilities)
        band = score_band(overall)
        n_req_full = sum(1 for m in req_matches if m.status == "matched")
        summary = (f"{band.capitalize()} alignment ({overall:.0f}/100). "
                   + (f"{n_req_full} of {len(req_matches)} required skills are explicitly evidenced" if req_matches
                      else "No required skills were listed")
                   + (f"; your most relevant project is \"{proj.analyses[0].name}\"." if proj.analyses else
                      "; no projects section was detected."))
        warnings = list(ctx.job.requirements.warnings)
        if ctx.resume.missing_core_sections():
            warnings.append("Some standard resume sections were not detected: "
                            + ", ".join(SECTION_LABELS[k] for k in ctx.resume.missing_core_sections()) + ".")
        if len(ctx.job.units) > self.settings.max_embedding_units:
            warnings.append(f"Only the first {self.settings.max_embedding_units} job statements were compared semantically.")

        reqs_out = ctx.job.requirements.model_copy(update={"skills": ctx.requirements})
        return AnalysisResult(
            analysis_version=ANALYSIS_VERSION, scoring_version=cfg.version, taxonomy_version=self.taxonomy.version,
            model=self.model_info(), overall_score=overall, score_band=band, summary=summary,
            components=component_scores, calculation=calc, requirements=reqs_out, skill_matches=matches,
            resume_skills=resume_skill_list(hits), alignments=alignments, projects=proj.analyses, experience=experience,
            qualifications=qualifications, competencies=competencies, recommendations=recommendations,
            resume_sections=SectionInfo(detected=[SECTION_LABELS.get(k, k) for k in ctx.resume.section_keys()],
                                        missing=[SECTION_LABELS[k] for k in ctx.resume.missing_core_sections()]),
            warnings=warnings, limitations=LIMITATIONS, methodology=methodology_notes(cfg),
            input_fingerprint=self._fingerprint(req, reference),
        )

    def _fingerprint(self, req: AnalyzeRequest, reference: date) -> str:
        payload = {
            "resume": req.resume_text, "job": req.job_description,
            "requirements": [r.model_dump() for r in req.requirements] if req.requirements is not None else None,
            "reference_date": reference.isoformat(), "model": self.embedder.name, "scoring": self.config.version,
            "taxonomy": self.taxonomy.version, "analysis": ANALYSIS_VERSION,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()

    def _experience(self, ctx: AnalysisContext, reference: date) -> ExperienceAnalysis:
        reqs = ctx.job.requirements.experience
        exp_text = ctx.resume.section_text("experience")
        ranges = find_date_ranges(exp_text, reference) if exp_text else []
        months = estimate_experience_months(ranges) if ranges else None
        range_texts = [r.text for r in ranges][:8]
        if not reqs:
            return ExperienceAnalysis(status="not_required", required_min_years=None, estimated_months=months,
                                      date_ranges=range_texts, explanation="The posting does not state a required number of years.")
        min_years = min(r.min_years for r in reqs)
        source = next(r.text for r in reqs if r.min_years == min_years)
        if min_years == 0:
            return ExperienceAnalysis(status="met", required_min_years=0, estimated_months=months, date_ranges=range_texts,
                                      explanation=f"The posting accepts candidates with no prior experience: \"{truncate(source, 140)}\".")
        if months is None:
            return ExperienceAnalysis(status="unknown", required_min_years=min_years, estimated_months=None,
                                      date_ranges=[], explanation=(f"The posting asks for {min_years:g}+ years (\"{truncate(source, 120)}\"), "
                                                                   "but no date ranges were found in the experience section."))
        status = "met" if months >= min_years * 12 else "not_met"
        return ExperienceAnalysis(
            status=status, required_min_years=min_years, estimated_months=months, date_ranges=range_texts,
            explanation=(f"The posting asks for {min_years:g}+ years (\"{truncate(source, 120)}\"). Date ranges in your "
                         f"experience section cover about {months} months (overlaps merged)."),
        )

    def _qualifications(self, ctx: AnalysisContext) -> list[QualificationCheck]:
        import re

        out: list[QualificationCheck] = []
        edu_lines = [ln for ln in ctx.resume_lines if ln.section == "education"]
        degree_patterns = {
            "bachelor": r"\b(?:bachelor'?s?|b\.?\s?tech|b\.?e\b|b\.?s\.?c?\b|bsc|b\.?a\b|bca|undergraduate)",
            "master": r"\b(?:master'?s?|m\.?\s?tech|m\.?s\.?c?\b|msc|mba|mca|m\.?e\b)",
            "phd": r"\b(?:ph\.?d|doctorate)",
        }
        for requirement in ctx.job.requirements.education[:4]:
            wanted = [k for k, p in degree_patterns.items() if re.search(p, requirement, re.IGNORECASE)] or ["bachelor", "master", "phd"]
            evidence: Evidence | None = None
            for ln in edu_lines:
                if any(re.search(degree_patterns[k], ln.text, re.IGNORECASE) for k in (wanted + ["master", "phd"] if "bachelor" in wanted else wanted)):
                    evidence = evidence_from_line(ln)
                    break
            if evidence:
                in_progress = re.search(r"\b(?:expected|pursuing|present|current|ongoing|20\d\d\s*$)", evidence.text, re.IGNORECASE)
                out.append(QualificationCheck(kind="education", requirement=truncate(requirement, 200), status="likely_met",
                                              resume_evidence=evidence, reasoning=(
                                                  "A matching degree level appears in your education section"
                                                  + (" (it may still be in progress)." if in_progress else ".")
                                                  + " Confirm the field of study matches the posting.")))
            elif edu_lines:
                out.append(QualificationCheck(kind="education", requirement=truncate(requirement, 200), status="review",
                                              resume_evidence=evidence_from_line(edu_lines[0]),
                                              reasoning="An education section exists, but the degree level could not be matched automatically."))
            else:
                out.append(QualificationCheck(kind="education", requirement=truncate(requirement, 200), status="not_found",
                                              resume_evidence=None, reasoning="No education section was detected in the resume."))
        cert_lines = [ln for ln in ctx.resume_lines if ln.section == "certifications"]
        for requirement in ctx.job.requirements.certifications[:4]:
            req_hits = extract_from_lines([LineRef("required", requirement, 0)], self.taxonomy)
            req_skills = {n for n, h in req_hits.items() if h.is_confirmed}
            evidence = None
            for ln in cert_lines:
                line_hits = extract_from_lines([ln], self.taxonomy)
                if req_skills & {n for n, h in line_hits.items() if h.is_confirmed}:
                    evidence = evidence_from_line(ln)
                    break
            if evidence:
                status, reason = "likely_met", "A certification mentioning the same technology appears in your resume. Verify it is the exact certification requested."
            elif cert_lines:
                status, reason = "review", "You list certifications, but none clearly matches this requirement."
                evidence = evidence_from_line(cert_lines[0])
            else:
                status, reason = "not_found", "No certifications section was detected."
            out.append(QualificationCheck(kind="certification", requirement=truncate(requirement, 200), status=status,
                                          resume_evidence=evidence, reasoning=reason))
        return out

    def _competencies(self, ctx: AnalysisContext, hits: dict) -> list[CompetencyCheck]:
        out = []
        for c in ctx.job.requirements.competencies:
            h = hits.get(c.skill)
            ev = None
            if h and h.is_confirmed:
                best = sorted(h.accepted, key=lambda m: -SECTION_PRIORITY.get(m.line.section, 0))[0]
                ev = evidence_from_line(best.line)
            out.append(CompetencyCheck(name=c.skill, importance=c.importance, found=ev is not None, evidence=ev,
                                       job_evidence=c.evidence))
        return out
