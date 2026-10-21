package com.careerlens.common.ratelimit;

import com.careerlens.common.error.ApiException;
import com.careerlens.config.AppProperties;
import java.time.Clock;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * In-memory token-bucket rate limiter for expensive or abuse-prone operations.
 *
 * <p>Limits are per application instance. For multi-instance deployments a shared store
 * (e.g. Redis) would be required; this is documented as a known limitation.
 */
@Component
public class RateLimiter {

    public enum Bucket { AUTH, UPLOAD, ANALYSIS, EXTRACT, REPORT }

    private record State(double tokens, long updatedAtMillis) {}

    private final Map<String, State> states = new ConcurrentHashMap<>();
    private final Map<Bucket, Integer> perMinute;
    private final Clock clock;

    public RateLimiter(AppProperties props, Clock clock) {
        AppProperties.RateLimits r = props.rateLimits();
        this.perMinute = Map.of(
                Bucket.AUTH, r.authPerMinute(),
                Bucket.UPLOAD, r.uploadPerMinute(),
                Bucket.ANALYSIS, r.analysisPerMinute(),
                Bucket.EXTRACT, r.extractPerMinute(),
                Bucket.REPORT, r.reportPerMinute());
        this.clock = clock;
    }

    /** Consumes one token or throws HTTP 429. */
    public void acquire(Bucket bucket, String key) {
        int capacity = perMinute.get(bucket);
        double refillPerMs = capacity / 60_000.0;
        long now = clock.millis();
        boolean[] allowed = {false};
        states.compute(bucket + ":" + key, (k, s) -> {
            double tokens = s == null ? capacity : Math.min(capacity, s.tokens() + (now - s.updatedAtMillis()) * refillPerMs);
            if (tokens >= 1.0) {
                allowed[0] = true;
                return new State(tokens - 1.0, now);
            }
            return new State(tokens, now);
        });
        if (!allowed[0]) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED",
                    "Too many requests. Please wait a moment and try again.");
        }
    }

    /** Drops idle buckets so memory stays bounded. */
    @Scheduled(fixedDelay = 300_000)
    public void evictIdle() {
        long cutoff = clock.millis() - 600_000;
        states.entrySet().removeIf(e -> e.getValue().updatedAtMillis() < cutoff);
    }

    int trackedKeys() {
        return states.size();
    }
}
