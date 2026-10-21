package com.careerlens.analysis;

import com.careerlens.analysis.dto.AnalysisRequest;
import com.careerlens.common.ratelimit.RateLimiter;
import com.careerlens.comparison.dto.ComparisonDetail;
import com.careerlens.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/analyses")
@Tag(name = "Analysis")
public class AnalysisController {

    private final AnalysisService analysisService;
    private final RateLimiter rateLimiter;

    public AnalysisController(AnalysisService analysisService, RateLimiter rateLimiter) {
        this.analysisService = analysisService;
        this.rateLimiter = rateLimiter;
    }

    @Operation(summary = "Analyse a stored resume against a job description",
            description = "Runs the NLP pipeline and stores the result as an unsaved draft comparison. "
                    + "Save it with PATCH /api/v1/comparisons/{id} {\"saved\": true}; unsaved drafts are deleted after 24 hours.")
    @PostMapping
    public ResponseEntity<ComparisonDetail> analyze(@Valid @RequestBody AnalysisRequest body) {
        UUID userId = CurrentUser.id();
        rateLimiter.acquire(RateLimiter.Bucket.ANALYSIS, userId.toString());
        return ResponseEntity.status(HttpStatus.CREATED).body(analysisService.analyze(userId, body));
    }
}
