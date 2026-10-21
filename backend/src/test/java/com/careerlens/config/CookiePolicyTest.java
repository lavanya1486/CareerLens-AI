package com.careerlens.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.careerlens.security.AuthCookieService;
import com.careerlens.security.JwtService;
import com.careerlens.support.TestData;
import java.time.Clock;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletResponse;

class CookiePolicyTest {

    private static AppProperties withCookie(AppProperties.Cookie cookie) {
        AppProperties base = TestData.props("http://localhost:8000", 100);
        return new AppProperties(base.frontendOrigins(), base.jwt(), cookie, base.aiService(), base.limits(),
                base.rateLimits(), base.retention());
    }

    private static void validate(AppProperties.Cookie cookie) {
        new StartupValidator(withCookie(cookie), new MockEnvironment());
    }

    @Test
    void defaultPolicyKeepsTheCsrfCookieStrict() {
        assertThat(new AppProperties.Cookie("s", false, "Lax", false).csrfSameSite()).isEqualTo("Strict");
        assertThat(new AppProperties.Cookie("s", true, "none", true).csrfSameSite()).isEqualTo("None");
    }

    @Test
    void rejectsUnknownSameSiteValues() {
        assertThatThrownBy(() -> validate(new AppProperties.Cookie("s", true, "Relaxed", false)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("COOKIE_SAME_SITE");
    }

    @Test
    void crossSiteCookiesRequireSecure() {
        assertThatThrownBy(() -> validate(new AppProperties.Cookie("s", false, "None", false)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("COOKIE_SECURE");
        assertThatThrownBy(() -> validate(new AppProperties.Cookie("s", false, "Lax", true)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("COOKIE_SECURE");
        assertThatCode(() -> validate(new AppProperties.Cookie("s", true, "None", true))).doesNotThrowAnyException();
    }

    @Test
    void sessionCookieCarriesPartitionedAttributeWhenEnabled() {
        AppProperties props = withCookie(new AppProperties.Cookie("careerlens_session", true, "None", true));
        AuthCookieService service = new AuthCookieService(props, new JwtService(props, Clock.systemUTC()));
        MockHttpServletResponse response = new MockHttpServletResponse();
        service.write(response, "token-value");
        String header = response.getHeader("Set-Cookie");
        assertThat(header).contains("HttpOnly", "Secure", "SameSite=None", "Partitioned");
    }

    @Test
    void sessionCookieDefaultsAreUnchanged() {
        AppProperties props = TestData.props("http://localhost:8000", 100);
        AuthCookieService service = new AuthCookieService(props, new JwtService(props, Clock.systemUTC()));
        MockHttpServletResponse response = new MockHttpServletResponse();
        service.write(response, "token-value");
        assertThat(response.getHeader("Set-Cookie")).contains("SameSite=Lax").doesNotContain("Partitioned");
    }

    @Test
    void rejectsTheDocumentedDevelopmentJwtSecret() {
        AppProperties base = TestData.props("http://localhost:8000", 100);
        AppProperties.Jwt jwt = new AppProperties.Jwt("dev-only-insecure-secret-change-me-0123456789abcdef", 60,
                "careerlens");
        AppProperties props = new AppProperties(base.frontendOrigins(), jwt, base.cookie(), base.aiService(),
                base.limits(), base.rateLimits(), base.retention());
        assertThatThrownBy(() -> new StartupValidator(props, new MockEnvironment()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("JWT_SECRET");
    }

    @Test
    void productionRequiresHttpsForRemoteAiService() {
        AppProperties base = TestData.props("http://ai.example.test", 100);
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        assertThatThrownBy(() -> new StartupValidator(base, environment))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("AI_SERVICE_URL");
    }
}
