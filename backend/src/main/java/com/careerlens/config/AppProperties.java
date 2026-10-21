package com.careerlens.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** Strongly typed application configuration bound from the {@code app.*} namespace. */
@Validated
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        @NotNull List<String> frontendOrigins,
        @Valid @NotNull Jwt jwt,
        @Valid @NotNull Cookie cookie,
        @Valid @NotNull AiService aiService,
        @Valid @NotNull Limits limits,
        @Valid @NotNull RateLimits rateLimits,
        @Valid @NotNull Retention retention) {

    public record Jwt(@NotBlank String secret, @Min(5) long expirationMinutes, @NotBlank String issuer) {}

    /**
     * Session/CSRF cookie policy. {@code sameSite=None} plus {@code partitioned=true} is only for running the UI
     * inside a cross-site frame (e.g. a hosted preview); both require {@code secure=true}.
     */
    public record Cookie(@NotBlank String name, boolean secure, @NotBlank String sameSite, boolean partitioned) {

        /** The readable XSRF cookie stays Strict unless the deployment explicitly needs cross-site frames. */
        public String csrfSameSite() {
            return "None".equalsIgnoreCase(sameSite) ? "None" : "Strict";
        }
    }

    public record AiService(
            @NotBlank String baseUrl,
            String apiKey,
            @NotNull Duration connectTimeout,
            @NotNull Duration readTimeout,
            @Min(1) int maxAttempts,
            @NotNull Duration retryBackoff) {}

    public record Limits(
            @Min(1024) long maxJsonBodyBytes,
            @Min(1000) int maxResumeChars,
            @Min(1000) int maxJobDescriptionChars,
            @Min(1) int maxResumesPerUser) {}

    public record RateLimits(
            @Min(1) int authPerMinute,
            @Min(1) int uploadPerMinute,
            @Min(1) int analysisPerMinute,
            @Min(1) int extractPerMinute,
            @Min(1) int reportPerMinute) {}

    public record Retention(@Min(1) int draftHours, @NotBlank String cleanupCron) {}
}
