package com.careerlens.ai;

import java.time.LocalDate;
import java.util.List;

/**
 * Records mirroring the Python NLP service's Pydantic schemas (see ai-service/app/schemas.py).
 * The AI client maps snake_case JSON to these camelCase records; the same records are returned
 * to the frontend and stored as the saved analysis document.
 */
public final class AiDtos {

    private AiDtos() {
    }

    // ------------------------------------------------------------- requests
    public record RequirementOverride(String skill, String importance, List<String> alternatives) {}

    public record AnalyzeRequest(String resumeText, String jobDescription, List<RequirementOverride> requirements,
                                 LocalDate referenceDate) {}

    public record JobExtractRequest(String jobDescription) {}

    public record ResumeParseRequest(String resumeText) {}

    // ------------------------------------------------------------- shared
    public record Evidence(String text, String section, String sectionLabel) {}

    public record RequirementSkill(String skill, String category, String categoryLabel, String importance,
                                   List<String> alternatives, String evidence, double confidence, boolean custom) {}

    public record RequirementStatement(String text, String importance) {}

    public record ExperienceRequirement(double minYears, Double maxYears, String text) {}

    public record JobRequirements(String suggestedTitle, List<RequirementSkill> skills,
                                  List<RequirementSkill> competencies, List<String> responsibilities,
                                  List<RequirementStatement> requirementStatements,
                                  List<ExperienceRequirement> experience, List<String> education,
                                  List<String> certifications, List<String> sectionsDetected, List<String> warnings) {}

    public record ResumeSection(String key, String label, String heading, String text) {}

    public record ResumeEntrySummary(String title, String section, int lines) {}

    public record ResumeStructure(List<ResumeSection> sections, List<String> detected, List<String> missing,
                                  List<ResumeEntrySummary> projects, List<ResumeEntrySummary> experience,
                                  List<String> skills, int wordCount) {}

    public record ResumeExtractResponse(String text, int pageCount, int charCount, List<String> warnings,
                                        ResumeStructure structure) {}

    // ------------------------------------------------------------- analysis
    public record ModelInfo(String name, String provider, int dimension) {}

    public record ComponentScore(String key, String label, double score, double weight, double effectiveWeight,
                                 double contribution, boolean available, String explanation) {}

    public record SkillMatch(String skill, String category, String categoryLabel, String importance,
                             List<String> alternatives, String status, String matchedVia, double credit,
                             double confidence, String jobEvidence, List<Evidence> resumeEvidence,
                             String evidenceStrength, List<String> relatedResumeSkills, String reasoning,
                             String nextStep, Evidence semanticHint, Double semanticSimilarity) {}

    public record ResumeSkill(String skill, String category, String categoryLabel, List<String> sections,
                              boolean confirmed) {}

    public record Alignment(String requirement, String kind, String importance, Evidence bestEvidence,
                            double similarity, double score, String classification) {}

    public record MatchedRequirement(String skill, String importance) {}

    public record RelatedStatement(String text, double similarity) {}

    public record ProjectAnalysis(int rank, String name, String header, double relevanceScore,
                                  double skillCoverageScore, double semanticScore, List<String> technologies,
                                  List<MatchedRequirement> matchedRequirements, List<RelatedStatement> relatedStatements,
                                  List<String> evidence, List<String> missingEvidence, String explanation,
                                  List<String> futureImprovements) {}

    public record ExperienceAnalysis(String status, Double requiredMinYears, Integer estimatedMonths,
                                     List<String> dateRanges, String explanation) {}

    public record QualificationCheck(String kind, String requirement, String status, Evidence resumeEvidence,
                                     String reasoning) {}

    public record CompetencyCheck(String name, String importance, boolean found, Evidence evidence,
                                  String jobEvidence) {}

    public record Recommendation(String category, String priority, String title, String detail,
                                 List<String> grounding) {}

    public record SectionInfo(List<String> detected, List<String> missing) {}

    public record MethodologyNote(String title, String body) {}

    public record AnalysisResult(String analysisVersion, String scoringVersion, String taxonomyVersion, ModelInfo model,
                                 double overallScore, String scoreBand, String summary, List<ComponentScore> components,
                                 List<String> calculation, JobRequirements requirements, List<SkillMatch> skillMatches,
                                 List<ResumeSkill> resumeSkills, List<Alignment> alignments,
                                 List<ProjectAnalysis> projects, ExperienceAnalysis experience,
                                 List<QualificationCheck> qualifications, List<CompetencyCheck> competencies,
                                 List<Recommendation> recommendations, SectionInfo resumeSections,
                                 List<String> warnings, List<String> limitations, List<MethodologyNote> methodology,
                                 String inputFingerprint) {}

    public record Health(String status, String service, boolean modelLoaded, String model, String taxonomyVersion,
                         String scoringVersion) {}

    public record ErrorBody(String code, String message, List<String> details) {}
}
