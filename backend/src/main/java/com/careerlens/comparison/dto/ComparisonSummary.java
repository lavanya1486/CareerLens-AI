package com.careerlens.comparison.dto;

import com.careerlens.comparison.Comparison;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record ComparisonSummary(UUID id, String name, String jobTitle, String company, String resumeTitle,
                                boolean saved, BigDecimal overallScore, String scoreBand, BigDecimal requiredScore,
                                BigDecimal preferredScore, BigDecimal semanticScore, BigDecimal projectScore,
                                BigDecimal experienceScore, BigDecimal evidenceScore, String scoringVersion,
                                Instant createdAt, Instant savedAt) {

    public static ComparisonSummary from(Comparison c) {
        return new ComparisonSummary(c.getId(), c.getName(), c.getJobTitle(), c.getCompany(), c.getResumeTitle(),
                c.isSaved(), c.getOverallScore(), c.getScoreBand(), c.getRequiredScore(), c.getPreferredScore(),
                c.getSemanticScore(), c.getProjectScore(), c.getExperienceScore(), c.getEvidenceScore(),
                c.getScoringVersion(), c.getCreatedAt(), c.getSavedAt());
    }
}
