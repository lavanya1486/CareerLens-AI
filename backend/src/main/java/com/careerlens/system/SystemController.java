package com.careerlens.system;

import com.careerlens.ai.AiDtos;
import com.careerlens.ai.AiServiceClient;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Clock;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public status used by the frontend to show whether analysis is currently available. */
@RestController
@RequestMapping("/api/v1/system")
@Tag(name = "System")
public class SystemController {

    private static final Logger log = LoggerFactory.getLogger(SystemController.class);
    private static final long CACHE_MILLIS = 10_000;

    public record AiStatus(String status, boolean modelLoaded, String model, String scoringVersion) {}

    public record SystemStatus(String backend, AiStatus aiService, Instant checkedAt) {}

    private record Cached(SystemStatus status, long at) {}

    private final AiServiceClient ai;
    private final Clock clock;
    private final AtomicReference<Cached> cache = new AtomicReference<>();

    public SystemController(AiServiceClient ai, Clock clock) {
        this.ai = ai;
        this.clock = clock;
    }

    @Operation(summary = "Backend and NLP service availability")
    @GetMapping("/status")
    public SystemStatus status() {
        Cached c = cache.get();
        long now = clock.millis();
        if (c != null && now - c.at() < CACHE_MILLIS) {
            return c.status();
        }
        AiStatus aiStatus;
        try {
            AiDtos.Health h = ai.health();
            aiStatus = new AiStatus(h.modelLoaded() ? "UP" : "DEGRADED", h.modelLoaded(), h.model(), h.scoringVersion());
        } catch (RuntimeException e) {
            log.warn("ai_health_check_failed type={}", e.getClass().getSimpleName());
            aiStatus = new AiStatus("DOWN", false, null, null);
        }
        SystemStatus status = new SystemStatus("UP", aiStatus, clock.instant());
        cache.set(new Cached(status, now));
        return status;
    }
}
