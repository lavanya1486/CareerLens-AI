"""Pydantic request/response schemas - the public contract consumed by the Java backend."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Importance = Literal["required", "preferred"]
MatchStatus = Literal["matched", "partial", "missing", "review"]
EvidenceStrength = Literal["demonstrated", "mentioned", "listed", "none"]
AlignmentClass = Literal["strong", "moderate", "weak"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ---------------------------------------------------------------- requests
class RequirementOverride(StrictModel):
    skill: str = Field(min_length=1, max_length=80)
    importance: Importance
    alternatives: list[str] = Field(default_factory=list, max_length=5)

    @field_validator("alternatives")
    @classmethod
    def _clean_alternatives(cls, v: list[str]) -> list[str]:
        cleaned = [a.strip() for a in v if a and a.strip()]
        if any(len(a) > 80 for a in cleaned):
            raise ValueError("alternative skill names must be at most 80 characters")
        return cleaned


class JobExtractRequest(StrictModel):
    job_description: str = Field(min_length=1)


class ResumeParseRequest(StrictModel):
    resume_text: str = Field(min_length=1)


class AnalyzeRequest(StrictModel):
    resume_text: str = Field(min_length=1)
    job_description: str = Field(min_length=1)
    requirements: list[RequirementOverride] | None = Field(default=None, max_length=80)
    reference_date: date | None = None


# ---------------------------------------------------------------- shared
class Evidence(BaseModel):
    text: str
    section: str
    section_label: str


class RequirementSkill(BaseModel):
    skill: str
    category: str
    category_label: str
    importance: Importance
    alternatives: list[str] = Field(default_factory=list)
    evidence: str
    confidence: float
    custom: bool = False


class RequirementStatement(BaseModel):
    text: str
    importance: Importance


class ExperienceRequirement(BaseModel):
    min_years: float
    max_years: float | None = None
    text: str


class JobRequirements(BaseModel):
    suggested_title: str | None = None
    skills: list[RequirementSkill]
    competencies: list[RequirementSkill]
    responsibilities: list[str]
    requirement_statements: list[RequirementStatement]
    experience: list[ExperienceRequirement]
    education: list[str]
    certifications: list[str]
    sections_detected: list[str]
    warnings: list[str]


class SectionInfo(BaseModel):
    detected: list[str]
    missing: list[str]


class ResumeSection(BaseModel):
    key: str
    label: str
    heading: str | None
    text: str


class ResumeEntrySummary(BaseModel):
    title: str
    section: str
    lines: int


class ResumeStructure(BaseModel):
    sections: list[ResumeSection]
    detected: list[str]
    missing: list[str]
    projects: list[ResumeEntrySummary]
    experience: list[ResumeEntrySummary]
    skills: list[str]
    word_count: int


class ResumeExtractResponse(BaseModel):
    text: str
    page_count: int
    char_count: int
    warnings: list[str]
    structure: ResumeStructure


# ---------------------------------------------------------------- analysis
class ModelInfo(BaseModel):
    name: str
    provider: str
    dimension: int


class ComponentScore(BaseModel):
    key: str
    label: str
    score: float
    weight: float
    effective_weight: float
    contribution: float
    available: bool
    explanation: str


class SkillMatch(BaseModel):
    skill: str
    category: str
    category_label: str
    importance: Importance
    alternatives: list[str]
    status: MatchStatus
    matched_via: str | None
    credit: float
    confidence: float
    job_evidence: str
    resume_evidence: list[Evidence]
    evidence_strength: EvidenceStrength
    related_resume_skills: list[str]
    reasoning: str
    next_step: str
    semantic_hint: Evidence | None = None
    semantic_similarity: float | None = None


class ResumeSkill(BaseModel):
    skill: str
    category: str
    category_label: str
    sections: list[str]
    confirmed: bool


class Alignment(BaseModel):
    requirement: str
    kind: Literal["requirement", "responsibility"]
    importance: Importance
    best_evidence: Evidence | None
    similarity: float
    score: float
    classification: AlignmentClass


class MatchedRequirement(BaseModel):
    skill: str
    importance: Importance


class RelatedStatement(BaseModel):
    text: str
    similarity: float


class ProjectAnalysis(BaseModel):
    rank: int
    name: str
    header: str
    relevance_score: float
    skill_coverage_score: float
    semantic_score: float
    technologies: list[str]
    matched_requirements: list[MatchedRequirement]
    related_statements: list[RelatedStatement]
    evidence: list[str]
    missing_evidence: list[str]
    explanation: str
    future_improvements: list[str]


class ExperienceAnalysis(BaseModel):
    status: Literal["met", "not_met", "unknown", "not_required"]
    required_min_years: float | None
    estimated_months: int | None
    date_ranges: list[str]
    explanation: str


class QualificationCheck(BaseModel):
    kind: Literal["education", "certification"]
    requirement: str
    status: Literal["likely_met", "review", "not_found"]
    resume_evidence: Evidence | None
    reasoning: str


class CompetencyCheck(BaseModel):
    name: str
    importance: Importance
    found: bool
    evidence: Evidence | None
    job_evidence: str


class Recommendation(BaseModel):
    category: Literal["learn", "highlight", "clarity", "project", "evidence"]
    priority: Literal["high", "medium", "low"]
    title: str
    detail: str
    grounding: list[str]


class MethodologyNote(BaseModel):
    title: str
    body: str


class AnalysisResult(BaseModel):
    analysis_version: str
    scoring_version: str
    taxonomy_version: str
    model: ModelInfo
    overall_score: float
    score_band: Literal["strong", "good", "partial", "limited"]
    summary: str
    components: list[ComponentScore]
    calculation: list[str]
    requirements: JobRequirements
    skill_matches: list[SkillMatch]
    resume_skills: list[ResumeSkill]
    alignments: list[Alignment]
    projects: list[ProjectAnalysis]
    experience: ExperienceAnalysis
    qualifications: list[QualificationCheck]
    competencies: list[CompetencyCheck]
    recommendations: list[Recommendation]
    resume_sections: SectionInfo
    warnings: list[str]
    limitations: list[str]
    methodology: list[MethodologyNote]
    input_fingerprint: str


class SkillComparisonResponse(BaseModel):
    taxonomy_version: str
    requirements: JobRequirements
    skill_matches: list[SkillMatch]
    resume_skills: list[ResumeSkill]


class ProjectRelevanceResponse(BaseModel):
    model: ModelInfo
    projects: list[ProjectAnalysis]
    recommendations: list[Recommendation]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    service: str
    model_loaded: bool
    model: str
    taxonomy_version: str
    scoring_version: str


class ErrorResponse(BaseModel):
    code: str
    message: str
    details: list[str] = Field(default_factory=list)
