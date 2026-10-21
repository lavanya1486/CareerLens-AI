// Mirrors the Spring Boot DTOs (camelCase JSON). Keep in sync with backend/src/main/java/com/careerlens/**/dto.

export type Importance = "required" | "preferred";
export type MatchStatus = "matched" | "partial" | "missing" | "review";
export type EvidenceStrength = "demonstrated" | "mentioned" | "listed" | "none";
export type ScoreBand = "strong" | "good" | "partial" | "limited";

export interface User {
  id: string;
  email: string;
  fullName: string;
  headline: string | null;
  createdAt: string;
}

export interface FieldViolation {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  status: number;
  code: string;
  message: string;
  fieldErrors: FieldViolation[];
  path?: string;
  requestId?: string;
  timestamp?: string;
}

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface Evidence {
  text: string;
  section: string;
  sectionLabel: string;
}

export interface ResumeSection {
  key: string;
  label: string;
  heading: string;
  text: string;
}

export interface ResumeEntrySummary {
  title: string;
  section: string;
  lines: number;
}

export interface ResumeStructure {
  sections: ResumeSection[];
  detected: string[];
  missing: string[];
  projects: ResumeEntrySummary[];
  experience: ResumeEntrySummary[];
  skills: string[];
  wordCount: number;
}

export interface ResumeSummary {
  id: string;
  title: string;
  sourceType: "PDF" | "TEXT";
  originalFilename: string | null;
  pageCount: number | null;
  charCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeDetail extends ResumeSummary {
  content: string;
  structure: ResumeStructure | null;
  warnings: string[];
}

export interface RequirementSkill {
  skill: string;
  category: string;
  categoryLabel: string;
  importance: Importance;
  alternatives: string[];
  evidence: string;
  confidence: number;
  custom: boolean;
}

export interface RequirementStatement {
  text: string;
  importance: Importance;
}

export interface ExperienceRequirement {
  minYears: number;
  maxYears: number | null;
  text: string;
}

export interface JobRequirements {
  suggestedTitle: string | null;
  skills: RequirementSkill[];
  competencies: RequirementSkill[];
  responsibilities: string[];
  requirementStatements: RequirementStatement[];
  experience: ExperienceRequirement[];
  education: string[];
  certifications: string[];
  sectionsDetected: string[];
  warnings: string[];
}

export interface RequirementInput {
  skill: string;
  importance: Importance;
  alternatives: string[];
}

export interface ModelInfo {
  name: string;
  provider: string;
  dimension: number;
}

export interface ComponentScore {
  key: string;
  label: string;
  score: number;
  weight: number;
  effectiveWeight: number;
  contribution: number;
  available: boolean;
  explanation: string;
}

export interface SkillMatch {
  skill: string;
  category: string;
  categoryLabel: string;
  importance: Importance;
  alternatives: string[];
  status: MatchStatus;
  matchedVia: string | null;
  credit: number;
  confidence: number;
  jobEvidence: string;
  resumeEvidence: Evidence[];
  evidenceStrength: EvidenceStrength;
  relatedResumeSkills: string[];
  reasoning: string;
  nextStep: string | null;
  semanticHint: Evidence | null;
  semanticSimilarity: number | null;
}

export interface ResumeSkill {
  skill: string;
  category: string;
  categoryLabel: string;
  sections: string[];
  confirmed: boolean;
}

export interface Alignment {
  requirement: string;
  kind: "requirement" | "responsibility";
  importance: Importance;
  bestEvidence: Evidence | null;
  similarity: number;
  score: number;
  classification: "strong" | "moderate" | "weak";
}

export interface ProjectAnalysis {
  rank: number;
  name: string;
  header: string;
  relevanceScore: number;
  skillCoverageScore: number;
  semanticScore: number;
  technologies: string[];
  matchedRequirements: { skill: string; importance: Importance }[];
  relatedStatements: { text: string; similarity: number }[];
  evidence: string[];
  missingEvidence: string[];
  explanation: string;
  futureImprovements: string[];
}

export interface ExperienceAnalysis {
  status: "met" | "not_met" | "unknown" | "not_required";
  requiredMinYears: number | null;
  estimatedMonths: number | null;
  dateRanges: string[];
  explanation: string;
}

export interface QualificationCheck {
  kind: "education" | "certification";
  requirement: string;
  status: "likely_met" | "review" | "not_found";
  resumeEvidence: Evidence | null;
  reasoning: string;
}

export interface CompetencyCheck {
  name: string;
  importance: Importance;
  found: boolean;
  evidence: Evidence | null;
  jobEvidence: string;
}

export interface Recommendation {
  category: "learn" | "highlight" | "clarity" | "project" | "evidence";
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  grounding: string[];
}

export interface AnalysisResult {
  analysisVersion: string;
  scoringVersion: string;
  taxonomyVersion: string;
  model: ModelInfo;
  overallScore: number;
  scoreBand: ScoreBand;
  summary: string;
  components: ComponentScore[];
  calculation: string[];
  requirements: JobRequirements;
  skillMatches: SkillMatch[];
  resumeSkills: ResumeSkill[];
  alignments: Alignment[];
  projects: ProjectAnalysis[];
  experience: ExperienceAnalysis;
  qualifications: QualificationCheck[];
  competencies: CompetencyCheck[];
  recommendations: Recommendation[];
  resumeSections: { detected: string[]; missing: string[] };
  warnings: string[];
  limitations: string[];
  methodology: { title: string; body: string }[];
  inputFingerprint: string;
}

export interface ComparisonSummary {
  id: string;
  name: string;
  jobTitle: string | null;
  company: string | null;
  resumeTitle: string | null;
  saved: boolean;
  overallScore: number;
  scoreBand: ScoreBand;
  requiredScore: number | null;
  preferredScore: number | null;
  semanticScore: number | null;
  projectScore: number | null;
  experienceScore: number | null;
  evidenceScore: number | null;
  scoringVersion: string;
  createdAt: string;
  savedAt: string | null;
}

export interface ComparisonDetail {
  id: string;
  name: string;
  jobTitle: string | null;
  company: string | null;
  resumeId: string | null;
  resumeTitle: string | null;
  saved: boolean;
  overallScore: number;
  scoreBand: ScoreBand;
  scoringVersion: string;
  analysisVersion: string;
  taxonomyVersion: string;
  modelName: string;
  jobDescription: string;
  createdAt: string;
  updatedAt: string;
  savedAt: string | null;
  result: AnalysisResult;
}

export interface ComparisonQuery {
  q?: string;
  jobTitle?: string;
  minScore?: number;
  maxScore?: number;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
  sort?: string;
}

export interface Dashboard {
  totalComparisons: number;
  averageScore: number | null;
  highestScore: number | null;
  highestScoreComparisonId: string | null;
  highestScoreComparisonName: string | null;
  resumeCount: number;
  recent: ComparisonSummary[];
  frequentlyMissingSkills: { skill: string; category: string; count: number }[];
  mostRequestedSkills: { skill: string; category: string; requested: number; matched: number }[];
  scoreBands: { band: ScoreBand; count: number }[];
  trend: {
    scoringVersion: string | null;
    excludedOtherVersions: number;
    points: { id: string; name: string; createdAt: string; score: number }[];
  };
}

export interface SystemStatus {
  backend: string;
  aiService: { status: "UP" | "DEGRADED" | "DOWN"; modelLoaded: boolean; model: string | null; scoringVersion: string | null };
  checkedAt: string;
}
