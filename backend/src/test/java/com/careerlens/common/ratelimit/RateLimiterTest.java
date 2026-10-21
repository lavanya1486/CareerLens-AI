package com.careerlens.common.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.careerlens.common.error.ApiException;
import com.careerlens.support.MutableClock;
import com.careerlens.support.TestData;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class RateLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-18T10:00:00Z"));
    private final RateLimiter limiter = new RateLimiter(TestData.props("http://ai", 3), clock);

    @Test
    void allowsCapacityThenRejectsWith429() {
        for (int i = 0; i < 3; i++) {
            limiter.acquire(RateLimiter.Bucket.ANALYSIS, "user-1");
        }
        assertThatThrownBy(() -> limiter.acquire(RateLimiter.Bucket.ANALYSIS, "user-1"))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("RATE_LIMITED"));
    }

    @Test
    void tokensRefillOverTime() {
        for (int i = 0; i < 3; i++) {
            limiter.acquire(RateLimiter.Bucket.UPLOAD, "user-1");
        }
        clock.advance(Duration.ofSeconds(20)); // 3 per minute -> one token every 20 s
        limiter.acquire(RateLimiter.Bucket.UPLOAD, "user-1");
        assertThatThrownBy(() -> limiter.acquire(RateLimiter.Bucket.UPLOAD, "user-1")).isInstanceOf(ApiException.class);
    }

    @Test
    void bucketsAndKeysAreIndependent() {
        for (int i = 0; i < 3; i++) {
            limiter.acquire(RateLimiter.Bucket.AUTH, "1.2.3.4");
        }
        limiter.acquire(RateLimiter.Bucket.AUTH, "5.6.7.8");
        limiter.acquire(RateLimiter.Bucket.REPORT, "1.2.3.4");
    }
}
