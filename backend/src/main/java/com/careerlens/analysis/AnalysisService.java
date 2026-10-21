package com.careerlens.analysis;

import com.careerlens.ai.AiDtos;
import com.careerlens.ai.AiServiceClient;
import com.careerlens.analysis.dto.AnalysisRequest;
import com.careerlens.comparison.ComparisonService;
import com.careerlens.comparison.dto.ComparisonDetail;
import com.careerlens.resume.Resume;
import com.careerlens.resume.ResumeService;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Orchestrates an analysis: ownership check -> NLP service call (outside any DB transaction)
 * -> atomic persistence of the result. If the NLP service fails, nothing is stored.
 */
@Service
public class AnalysisService {

    private final ResumeService resumeService;
    private final AiServiceClient ai;
    private final ComparisonService comparisonService;
    private final Clock clock;

    public AnalysisService(ResumeService resumeService, AiServiceClient ai, ComparisonService comparisonService,
                           Clock clock) {
        this.resumeService = resumeService;
        this.ai = ai;
        this.comparisonService = comparisonService;
        this.clock = clock;
    }

    public ComparisonDetail analyze(UUID userId, AnalysisRequest req) {
        Resume resume = resumeService.getOwned(userId, req.resumeId());
        List<AiDtos.RequirementOverride> overrides = req.requirements() == null ? null : req.requirements().stream()
                .map(r -> new AiDtos.RequirementOverride(r.skill().trim(), r.importance(),
                        r.alternatives() == null ? List.of() : r.alternatives().stream().map(String::trim).toList()))
                .toList();
        String jobDescription = req.jobDescription().replace("\u0000", "").strip();
        AiDtos.AnalysisResult result = ai.analyze(new AiDtos.AnalyzeRequest(resume.getContentText(), jobDescription,
                overrides, LocalDate.now(clock)));
        return comparisonService.createDraft(userId, resume, jobDescription, req.jobTitle(), req.company(), result);
    }
}
