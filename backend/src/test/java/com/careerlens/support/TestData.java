package com.careerlens.support;

import com.careerlens.ai.AiDtos;
import com.careerlens.comparison.dto.ComparisonDetail;
import com.careerlens.config.AppProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Shared fixtures. JSON fixtures were recorded from the real Python AI service. */
public final class TestData {

    public static final String JWT_SECRET = "unit-test-secret-0123456789abcdef0123456789";

    private TestData() {}

    public static String fixture(String name) {
        try (InputStream in = TestData.class.getResourceAsStream("/fixtures/" + name)) {
            if (in == null) {
                throw new IllegalArgumentException("Missing fixture " + name);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static byte[] demoResumePdf() {
        try (InputStream in = TestData.class.getResourceAsStream("/fixtures/resume-ananya-rao.pdf")) {
            return in.readAllBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Snake-case mapper that fails on any field the Java contract does not model. */
    public static ObjectMapper strictSnakeMapper() {
        return new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, true);
    }

    public static AiDtos.AnalysisResult analysisResult() {
        try {
            return strictSnakeMapper().readValue(fixture("analysis-response.json"), AiDtos.AnalysisResult.class);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static ComparisonDetail comparisonDetail() {
        AiDtos.AnalysisResult r = analysisResult();
        Instant now = Instant.parse("2026-10-18T10:15:00Z");
        return new ComparisonDetail(UUID.randomUUID(), "Java Backend Developer Intern at Northwind Fintech",
                "Java Backend Developer Intern", "Northwind Fintech", UUID.randomUUID(), "Ananya Rao - resume", true,
                BigDecimal.valueOf(r.overallScore()).setScale(1, java.math.RoundingMode.HALF_UP), r.scoreBand(),
                r.scoringVersion(), r.analysisVersion(), r.taxonomyVersion(), r.model().name(),
                fixture("job-java-backend-intern.txt"), now, now, now, r);
    }

    public static AppProperties props(String aiBaseUrl, int ratePerMinute) {
        return new AppProperties(
                List.of("http://localhost:5173"),
                new AppProperties.Jwt(JWT_SECRET, 60, "careerlens"),
                new AppProperties.Cookie("careerlens_session", false, "Lax", false),
                new AppProperties.AiService(aiBaseUrl, "test-internal-key", Duration.ofMillis(500),
                        Duration.ofMillis(700), 2, Duration.ofMillis(10)),
                new AppProperties.Limits(262_144, 40_000, 20_000, 20),
                new AppProperties.RateLimits(ratePerMinute, ratePerMinute, ratePerMinute, ratePerMinute, ratePerMinute),
                new AppProperties.Retention(24, "0 15 * * * *"));
    }
}
