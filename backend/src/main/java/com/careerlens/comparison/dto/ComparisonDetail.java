package com.careerlens.comparison.dto;

import com.careerlens.ai.AiDtos;
import com.careerlens.comparison.Comparison;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record ComparisonDetail(UUID id, String name, String jobTitle, String company, UUID resumeId, String resumeTitle,
                               boolean saved, BigDecimal overallScore, String scoreBand, String scoringVersion,
                               String analysisVersion, String taxonomyVersion, String modelName, String jobDescription,
                               Instant createdAt, Instant updatedAt, Instant savedAt, AiDtos.AnalysisResult result) {

    public static ComparisonDetail from(Comparison c, AiDtos.AnalysisResult result) {
        return new ComparisonDetail(c.getId(), c.getName(), c.getJobTitle(), c.getCompany(), c.getResumeId(),
                c.getResumeTitle(), c.isSaved(), c.getOverallScore(), c.getScoreBand(), c.getScoringVersion(),
                c.getAnalysisVersion(), c.getTaxonomyVersion(), c.getModelName(), c.getJobDescription(),
                c.getCreatedAt(), c.getUpdatedAt(), c.getSavedAt(), result);
    }
}
