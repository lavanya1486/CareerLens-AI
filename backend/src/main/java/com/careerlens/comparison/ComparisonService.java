package com.careerlens.comparison;

import com.careerlens.ai.AiDtos;
import com.careerlens.common.error.ApiException;
import com.careerlens.comparison.dto.ComparisonDetail;
import com.careerlens.comparison.dto.ComparisonFilter;
import com.careerlens.comparison.dto.ComparisonSummary;
import com.careerlens.comparison.dto.UpdateComparisonRequest;
import com.careerlens.resume.Resume;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ComparisonService {

    private static final Logger log = LoggerFactory.getLogger(ComparisonService.class);
    private static final Set<String> SORTABLE = Set.of("createdAt", "overallScore", "name", "jobTitle");
    public static final int MAX_PAGE_SIZE = 50;

    private final ComparisonRepository comparisons;
    private final AnalysisResultRepository results;
    private final ComparisonSkillRepository skills;
    private final ObjectMapper mapper;

    public ComparisonService(ComparisonRepository comparisons, AnalysisResultRepository results,
                             ComparisonSkillRepository skills, ObjectMapper mapper) {
        this.comparisons = comparisons;
        this.results = results;
        this.skills = skills;
        this.mapper = mapper;
    }

    /** Persists a completed analysis as an unsaved draft (comparison + JSON result + skill rows) atomically. */
    @Transactional
    public ComparisonDetail createDraft(UUID userId, Resume resume, String jobDescription, String jobTitle,
                                        String company, AiDtos.AnalysisResult result) {
        String title = blankToNull(jobTitle);
        if (title == null && result.requirements() != null) {
            title = blankToNull(result.requirements().suggestedTitle());
        }
        String org = blankToNull(company);
        String name = title != null ? (org != null ? title + " at " + org : title) : "Untitled comparison";
        Comparison c = new Comparison(userId, resume.getId(), resume.getTitle(), truncate(name, 150),
                truncate(title, 150), truncate(org, 150), jobDescription);
        Map<String, Double> byKey = new LinkedHashMap<>();
        Map<String, Boolean> available = new LinkedHashMap<>();
        for (AiDtos.ComponentScore cs : result.components()) {
            byKey.put(cs.key(), cs.score());
            available.put(cs.key(), cs.available());
        }
        c.setScores(score(result.overallScore()), comp(byKey, available, "required_skills"),
                comp(byKey, available, "preferred_skills"), comp(byKey, available, "semantic"),
                comp(byKey, available, "projects"), comp(byKey, available, "experience"),
                comp(byKey, available, "evidence"), result.scoreBand());
        c.setVersions(result.scoringVersion(), result.analysisVersion(), result.taxonomyVersion(),
                result.model().name(), result.inputFingerprint());
        comparisons.save(c);
        results.save(new AnalysisResultEntity(c.getId(), toJson(result)));

        Map<String, ComparisonSkill> rows = new LinkedHashMap<>();
        for (AiDtos.SkillMatch m : result.skillMatches()) {
            String skillName = truncate(m.skill(), 80);
            rows.putIfAbsent(skillName.toLowerCase(Locale.ROOT), new ComparisonSkill(c.getId(), skillName,
                    truncate(m.category(), 30),
                    ComparisonSkill.Importance.valueOf(m.importance().toUpperCase(Locale.ROOT)),
                    ComparisonSkill.Status.valueOf(m.status().toUpperCase(Locale.ROOT))));
        }
        skills.saveAll(rows.values());
        log.info("comparison_created comparisonId={} score={} skills={}", c.getId(), result.overallScore(), rows.size());
        return ComparisonDetail.from(c, result);
    }

    @Transactional(readOnly = true)
    public Page<ComparisonSummary> search(UUID userId, ComparisonFilter filter, int page, int size, String sort) {
        if (filter.minScore() != null && filter.maxScore() != null && filter.minScore() > filter.maxScore()) {
            throw ApiException.badRequest("INVALID_FILTER", "minScore must not be greater than maxScore.");
        }
        if (filter.from() != null && filter.to() != null && filter.from().isAfter(filter.to())) {
            throw ApiException.badRequest("INVALID_FILTER", "'from' must not be after 'to'.");
        }
        PageRequest pageable = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), MAX_PAGE_SIZE), parseSort(sort));
        return comparisons.findAll(ComparisonSpecifications.savedFor(userId, filter), pageable).map(ComparisonSummary::from);
    }

    @Transactional(readOnly = true)
    public ComparisonDetail get(UUID userId, UUID id) {
        Comparison c = owned(userId, id);
        return ComparisonDetail.from(c, loadResult(c.getId()));
    }

    @Transactional
    public ComparisonDetail update(UUID userId, UUID id, UpdateComparisonRequest req) {
        Comparison c = owned(userId, id);
        if (req.name() != null) {
            if (req.name().isBlank()) {
                throw ApiException.badRequest("VALIDATION_ERROR", "Name must not be blank.");
            }
            c.setName(req.name().trim());
        }
        if (req.jobTitle() != null) {
            c.setJobTitle(blankToNull(req.jobTitle()));
        }
        if (req.company() != null) {
            c.setCompany(blankToNull(req.company()));
        }
        if (Boolean.TRUE.equals(req.saved())) {
            c.markSaved();
        }
        comparisons.flush();
        log.info("comparison_updated comparisonId={} saved={}", c.getId(), c.isSaved());
        return ComparisonDetail.from(c, loadResult(c.getId()));
    }

    @Transactional
    public void delete(UUID userId, UUID id) {
        Comparison c = owned(userId, id);
        comparisons.delete(c);
        comparisons.flush();
        log.info("comparison_deleted comparisonId={}", id);
    }

    Comparison owned(UUID userId, UUID id) {
        return comparisons.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Comparison"));
    }

    AiDtos.AnalysisResult loadResult(UUID comparisonId) {
        AnalysisResultEntity entity = results.findById(comparisonId)
                .orElseThrow(() -> ApiException.notFound("Analysis result"));
        try {
            return mapper.readValue(entity.getResultJson(), AiDtos.AnalysisResult.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Stored analysis result could not be read for comparison " + comparisonId, e);
        }
    }

    private String toJson(AiDtos.AnalysisResult result) {
        try {
            return mapper.writeValueAsString(result);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Analysis result could not be serialised", e);
        }
    }

    static Sort parseSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Direction.DESC, "createdAt");
        }
        String[] parts = sort.split(",");
        String property = parts[0].trim();
        if (!SORTABLE.contains(property)) {
            throw ApiException.badRequest("INVALID_SORT", "Sort must be one of " + SORTABLE + ".");
        }
        Sort.Direction dir = parts.length > 1 && parts[1].trim().equalsIgnoreCase("asc")
                ? Sort.Direction.ASC : Sort.Direction.DESC;
        return Sort.by(dir, property).and(Sort.by(Sort.Direction.DESC, "createdAt"));
    }

    private static BigDecimal comp(Map<String, Double> scores, Map<String, Boolean> available, String key) {
        return Boolean.TRUE.equals(available.get(key)) && scores.get(key) != null ? score(scores.get(key)) : null;
    }

    private static BigDecimal score(double v) {
        return BigDecimal.valueOf(Math.max(0, Math.min(100, v))).setScale(1, RoundingMode.HALF_UP);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}
