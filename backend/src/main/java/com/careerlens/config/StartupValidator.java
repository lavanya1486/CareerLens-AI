package com.careerlens.config;

import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Fails fast when production is started with insecure or missing configuration.
 */
@Component
public class StartupValidator {

    private static final Logger log = LoggerFactory.getLogger(StartupValidator.class);
    static final String DEV_SECRET_MARKER = "dev-only-insecure";

    private final AppProperties props;
    private final Environment environment;

    public StartupValidator(AppProperties props, Environment environment) {
        this.props = props;
        this.environment = environment;
        validate();
    }

    void validate() {
        boolean prod = Arrays.asList(environment.getActiveProfiles()).contains("prod");
        byte[] secret = props.jwt().secret().getBytes(StandardCharsets.UTF_8);
        if (secret.length < 32 || props.jwt().secret().contains(DEV_SECRET_MARKER)) {
            throw new IllegalStateException("JWT_SECRET must be at least 32 bytes (256 bits).");
        }
        AppProperties.Cookie cookie = props.cookie();
        if (!List.of("strict", "lax", "none").contains(cookie.sameSite().toLowerCase(Locale.ROOT))) {
            throw new IllegalStateException("COOKIE_SAME_SITE must be Strict, Lax or None.");
        }
        if (("none".equalsIgnoreCase(cookie.sameSite()) || cookie.partitioned()) && !cookie.secure()) {
            throw new IllegalStateException("COOKIE_SAME_SITE=None and COOKIE_PARTITIONED=true require COOKIE_SECURE=true.");
        }
        if (prod) {
            if (props.aiService().apiKey() == null || props.aiService().apiKey().isBlank()) {
                throw new IllegalStateException("AI_SERVICE_API_KEY must be set in production.");
            }
            URI aiServiceUrl;
            try {
                aiServiceUrl = new URI(props.aiService().baseUrl());
            } catch (URISyntaxException e) {
                throw new IllegalStateException("AI_SERVICE_URL must be a valid URL.", e);
            }
            boolean localHttp = "http".equalsIgnoreCase(aiServiceUrl.getScheme())
                    && ("localhost".equalsIgnoreCase(aiServiceUrl.getHost())
                    || "127.0.0.1".equals(aiServiceUrl.getHost())
                    || "::1".equals(aiServiceUrl.getHost()));
            if (!"https".equalsIgnoreCase(aiServiceUrl.getScheme()) && !localHttp) {
                throw new IllegalStateException("AI_SERVICE_URL must use HTTPS in production unless it targets localhost.");
            }
            if (props.frontendOrigins().stream().anyMatch(o -> o.contains("localhost") || o.equals("*"))) {
                throw new IllegalStateException("APP_CORS_ALLOWED_ORIGINS must list real production origins.");
            }
            if (!props.cookie().secure()) {
                log.warn("COOKIE_SECURE=false in production - only acceptable behind a TLS-terminating proxy during testing.");
            }
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void ready() {
        log.info("CareerLens backend ready (profiles={}, aiServiceConfigured={})",
                String.join(",", environment.getActiveProfiles()), !props.aiService().baseUrl().isBlank());
    }
}
