package com.careerlens.comparison;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Metadata and headline scores of one resume-vs-job analysis. The full result lives in {@link AnalysisResultEntity}. */
@Entity
@Table(name = "comparisons")
public class Comparison {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "resume_id")
    private UUID resumeId;

    @Column(name = "resume_title", length = 120)
    private String resumeTitle;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(name = "job_title", length = 150)
    private String jobTitle;

    @Column(length = 150)
    private String company;

    @Column(name = "job_description", nullable = false, columnDefinition = "text")
    private String jobDescription;

    @Column(nullable = false)
    private boolean saved;

    @Column(name = "overall_score", nullable = false, precision = 5, scale = 1)
    private BigDecimal overallScore;

    @Column(name = "required_score", precision = 5, scale = 1)
    private BigDecimal requiredScore;

    @Column(name = "preferred_score", precision = 5, scale = 1)
    private BigDecimal preferredScore;

    @Column(name = "semantic_score", precision = 5, scale = 1)
    private BigDecimal semanticScore;

    @Column(name = "project_score", precision = 5, scale = 1)
    private BigDecimal projectScore;

    @Column(name = "experience_score", precision = 5, scale = 1)
    private BigDecimal experienceScore;

    @Column(name = "evidence_score", precision = 5, scale = 1)
    private BigDecimal evidenceScore;

    @Column(name = "score_band", nullable = false, length = 10)
    private String scoreBand;

    @Column(name = "scoring_version", nullable = false, length = 20)
    private String scoringVersion;

    @Column(name = "analysis_version", nullable = false, length = 20)
    private String analysisVersion;

    @Column(name = "taxonomy_version", nullable = false, length = 20)
    private String taxonomyVersion;

    @Column(name = "model_name", nullable = false, length = 120)
    private String modelName;

    @Column(name = "input_fingerprint", nullable = false, length = 64)
    private String inputFingerprint;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "saved_at")
    private Instant savedAt;

    protected Comparison() {
    }

    public Comparison(UUID userId, UUID resumeId, String resumeTitle, String name, String jobTitle, String company,
                      String jobDescription) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.resumeId = resumeId;
        this.resumeTitle = resumeTitle;
        this.name = name;
        this.jobTitle = jobTitle;
        this.company = company;
        this.jobDescription = jobDescription;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public void markSaved() {
        if (!saved) {
            saved = true;
            savedAt = Instant.now();
        }
    }

    public void setScores(BigDecimal overall, BigDecimal required, BigDecimal preferred, BigDecimal semantic,
                          BigDecimal project, BigDecimal experience, BigDecimal evidence, String band) {
        this.overallScore = overall;
        this.requiredScore = required;
        this.preferredScore = preferred;
        this.semanticScore = semantic;
        this.projectScore = project;
        this.experienceScore = experience;
        this.evidenceScore = evidence;
        this.scoreBand = band;
    }

    public void setVersions(String scoringVersion, String analysisVersion, String taxonomyVersion, String modelName,
                            String inputFingerprint) {
        this.scoringVersion = scoringVersion;
        this.analysisVersion = analysisVersion;
        this.taxonomyVersion = taxonomyVersion;
        this.modelName = modelName;
        this.inputFingerprint = inputFingerprint;
    }

    public void setName(String name) { this.name = name; }
    public void setJobTitle(String jobTitle) { this.jobTitle = jobTitle; }
    public void setCompany(String company) { this.company = company; }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public UUID getResumeId() { return resumeId; }
    public String getResumeTitle() { return resumeTitle; }
    public String getName() { return name; }
    public String getJobTitle() { return jobTitle; }
    public String getCompany() { return company; }
    public String getJobDescription() { return jobDescription; }
    public boolean isSaved() { return saved; }
    public BigDecimal getOverallScore() { return overallScore; }
    public BigDecimal getRequiredScore() { return requiredScore; }
    public BigDecimal getPreferredScore() { return preferredScore; }
    public BigDecimal getSemanticScore() { return semanticScore; }
    public BigDecimal getProjectScore() { return projectScore; }
    public BigDecimal getExperienceScore() { return experienceScore; }
    public BigDecimal getEvidenceScore() { return evidenceScore; }
    public String getScoreBand() { return scoreBand; }
    public String getScoringVersion() { return scoringVersion; }
    public String getAnalysisVersion() { return analysisVersion; }
    public String getTaxonomyVersion() { return taxonomyVersion; }
    public String getModelName() { return modelName; }
    public String getInputFingerprint() { return inputFingerprint; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getSavedAt() { return savedAt; }
}
