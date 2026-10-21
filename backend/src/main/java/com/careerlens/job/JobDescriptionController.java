package com.careerlens.job;

import com.careerlens.ai.AiDtos;
import com.careerlens.ai.AiServiceClient;
import com.careerlens.common.ratelimit.RateLimiter;
import com.careerlens.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/job-descriptions")
@Tag(name = "Job descriptions")
public class JobDescriptionController {

    public record ExtractRequest(
            @NotBlank(message = "Paste a job description")
            @Size(min = 100, max = 20000, message = "Job description must be between 100 and 20,000 characters")
            String jobDescription) {}

    private final AiServiceClient ai;
    private final RateLimiter rateLimiter;

    public JobDescriptionController(AiServiceClient ai, RateLimiter rateLimiter) {
        this.ai = ai;
        this.rateLimiter = rateLimiter;
    }

    @Operation(summary = "Extract and classify requirements from a job description (not stored)")
    @PostMapping("/extract")
    public AiDtos.JobRequirements extract(@Valid @RequestBody ExtractRequest body) {
        rateLimiter.acquire(RateLimiter.Bucket.EXTRACT, CurrentUser.id().toString());
        return ai.extractJob(body.jobDescription().replace("\u0000", "").strip());
    }
}
