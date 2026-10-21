package com.careerlens.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.careerlens.support.MutableClock;
import com.careerlens.support.TestData;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class JwtServiceTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-18T10:00:00Z"));
    private final JwtService jwt = new JwtService(TestData.props("http://ai", 10), clock);

    @Test
    void issuedTokenVerifiesWithUserAndVersion() {
        UUID user = UUID.randomUUID();
        String token = jwt.issue(user, 3);

        JwtService.TokenClaims claims = jwt.verify(token).orElseThrow();
        assertThat(claims.userId()).isEqualTo(user);
        assertThat(claims.tokenVersion()).isEqualTo(3);
        assertThat(Duration.between(claims.issuedAt(), claims.expiresAt())).isEqualTo(Duration.ofMinutes(60));
    }

    @Test
    void expiredTokenIsRejected() {
        String token = jwt.issue(UUID.randomUUID(), 0);
        clock.advance(Duration.ofMinutes(61));
        assertThat(jwt.verify(token)).isEmpty();
    }

    @Test
    void tamperedTokenIsRejected() {
        String token = jwt.issue(UUID.randomUUID(), 0);
        String[] parts = token.split("\\.");
        String forgedPayload = java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString(("{\"sub\":\"" + UUID.randomUUID() + "\",\"ver\":0,\"iss\":\"careerlens\"}").getBytes());
        assertThat(jwt.verify(parts[0] + "." + forgedPayload + "." + parts[2])).isEmpty();
    }

    @Test
    void tokenSignedWithDifferentSecretIsRejected() {
        var otherProps = TestData.props("http://ai", 10);
        otherProps = new com.careerlens.config.AppProperties(otherProps.frontendOrigins(),
                new com.careerlens.config.AppProperties.Jwt("another-secret-abcdefghijklmnopqrstuvwxyz012345", 60, "careerlens"),
                otherProps.cookie(), otherProps.aiService(), otherProps.limits(), otherProps.rateLimits(), otherProps.retention());
        String foreign = new JwtService(otherProps, clock).issue(UUID.randomUUID(), 0);
        assertThat(jwt.verify(foreign)).isEmpty();
    }

    @Test
    void garbageIsRejectedWithoutThrowing() {
        assertThat(jwt.verify("not-a-jwt")).isEmpty();
        assertThat(jwt.verify("")).isEmpty();
    }
}
