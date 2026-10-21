package com.careerlens.security;

import com.careerlens.config.AppProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

/** Issues and verifies HS256-signed JWTs carrying the user id and token version. */
@Service
public class JwtService {

    public record TokenClaims(UUID userId, int tokenVersion, Instant issuedAt, Instant expiresAt) {}

    private final SecretKey key;
    private final Duration ttl;
    private final String issuer;
    private final Clock clock;

    public JwtService(AppProperties props, Clock clock) {
        this.key = Keys.hmacShaKeyFor(props.jwt().secret().getBytes(StandardCharsets.UTF_8));
        this.ttl = Duration.ofMinutes(props.jwt().expirationMinutes());
        this.issuer = props.jwt().issuer();
        this.clock = clock;
    }

    public String issue(UUID userId, int tokenVersion) {
        Instant now = clock.instant();
        return Jwts.builder()
                .subject(userId.toString())
                .issuer(issuer)
                .claim("ver", tokenVersion)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    public Optional<TokenClaims> verify(String token) {
        try {
            Claims c = Jwts.parser()
                    .verifyWith(key)
                    .requireIssuer(issuer)
                    .clock(() -> Date.from(clock.instant()))
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            Integer ver = c.get("ver", Integer.class);
            if (ver == null || c.getSubject() == null) {
                return Optional.empty();
            }
            return Optional.of(new TokenClaims(UUID.fromString(c.getSubject()), ver, c.getIssuedAt().toInstant(),
                    c.getExpiration().toInstant()));
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    public Duration ttl() {
        return ttl;
    }
}
