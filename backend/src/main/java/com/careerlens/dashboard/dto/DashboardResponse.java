package com.careerlens.dashboard.dto;

import com.careerlens.comparison.dto.BandCount;
import com.careerlens.comparison.dto.ComparisonSummary;
import com.careerlens.comparison.dto.SkillCount;
import com.careerlens.comparison.dto.SkillDemand;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record DashboardResponse(
        long totalComparisons,
        BigDecimal averageScore,
        BigDecimal highestScore,
        UUID highestScoreComparisonId,
        String highestScoreComparisonName,
        long resumeCount,
        List<ComparisonSummary> recent,
        List<SkillCount> frequentlyMissingSkills,
        List<SkillDemand> mostRequestedSkills,
        List<BandCount> scoreBands,
        Trend trend) {

    /** Score history restricted to one scoring version so points are comparable. */
    public record Trend(String scoringVersion, long excludedOtherVersions, List<TrendPoint> points) {}

    public record TrendPoint(UUID id, String name, Instant createdAt, BigDecimal score) {}
}
