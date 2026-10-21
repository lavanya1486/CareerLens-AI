package com.careerlens.dashboard;

import com.careerlens.comparison.Comparison;
import com.careerlens.comparison.ComparisonRepository;
import com.careerlens.comparison.ComparisonSkillRepository;
import com.careerlens.comparison.dto.ComparisonSummary;
import com.careerlens.comparison.dto.ScoreStats;
import com.careerlens.dashboard.dto.DashboardResponse;
import com.careerlens.resume.ResumeRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Dashboard metrics computed with aggregate queries over the user's saved comparisons only. */
@Service
public class DashboardService {

    static final int TREND_POINTS = 30;

    private final ComparisonRepository comparisons;
    private final ComparisonSkillRepository skills;
    private final ResumeRepository resumes;

    public DashboardService(ComparisonRepository comparisons, ComparisonSkillRepository skills,
                            ResumeRepository resumes) {
        this.comparisons = comparisons;
        this.skills = skills;
        this.resumes = resumes;
    }

    @Transactional(readOnly = true)
    public DashboardResponse build(UUID userId) {
        ScoreStats stats = comparisons.savedStats(userId);
        List<Comparison> recent = comparisons.findByUserIdAndSavedTrueOrderByCreatedAtDesc(userId, PageRequest.of(0, 5));
        List<Comparison> best = comparisons.findByUserIdAndSavedTrueOrderByOverallScoreDescCreatedAtDesc(userId,
                PageRequest.of(0, 1));
        DashboardResponse.Trend trend = new DashboardResponse.Trend(null, 0, List.of());
        if (!recent.isEmpty()) {
            String version = recent.get(0).getScoringVersion();
            List<DashboardResponse.TrendPoint> points = comparisons
                    .findByUserIdAndSavedTrueAndScoringVersionOrderByCreatedAtDesc(userId, version,
                            PageRequest.of(0, TREND_POINTS))
                    .stream()
                    .sorted(Comparator.comparing(Comparison::getCreatedAt))
                    .map(c -> new DashboardResponse.TrendPoint(c.getId(), c.getName(), c.getCreatedAt(), c.getOverallScore()))
                    .toList();
            trend = new DashboardResponse.Trend(version,
                    comparisons.countByUserIdAndSavedTrueAndScoringVersionNot(userId, version), points);
        }
        BigDecimal average = stats.average() == null ? null
                : BigDecimal.valueOf(stats.average()).setScale(1, RoundingMode.HALF_UP);
        Comparison top = best.isEmpty() ? null : best.get(0);
        return new DashboardResponse(
                stats.total(),
                average,
                stats.highest(),
                top != null ? top.getId() : null,
                top != null ? top.getName() : null,
                resumes.countByUserId(userId),
                recent.stream().map(ComparisonSummary::from).toList(),
                skills.frequentlyMissingRequired(userId, PageRequest.of(0, 8)),
                skills.mostRequested(userId, PageRequest.of(0, 10)),
                comparisons.bandCounts(userId),
                trend);
    }
}
