package com.careerlens.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockHttpServletResponse;

class AuthSecurityIntegrationTest extends IntegrationTestBase {

    @Test
    void registerSetsHardenedSessionCookieAndAuthenticates() throws Exception {
        Session s = newSession();
        MockHttpServletResponse r = s.register("Ananya Rao");

        assertThat(r.getStatus()).isEqualTo(201);
        String setCookie = String.join(" | ", r.getHeaders("Set-Cookie"));
        assertThat(setCookie).contains("careerlens_session=").contains("HttpOnly").contains("SameSite=Lax").contains("Path=/");
        assertThat(s.read(r).get("email").asText()).isEqualTo(s.email);
        assertThat(s.read(r).has("passwordHash")).isFalse();
        assertThat(s.getJson("/api/v1/users/me").get("fullName").asText()).isEqualTo("Ananya Rao");
        assertThat(jdbc.queryForObject("select password_hash from users where email = ?", String.class, s.email))
                .startsWith("$2").doesNotContain(Session.PASSWORD);
    }

    @Test
    void loginLogoutCycle() throws Exception {
        Session a = newSession().registered("A");
        assertThat(a.post("/api/v1/auth/logout").getStatus()).isEqualTo(204);
        assertThat(a.perform(get("/api/v1/users/me")).getStatus()).isEqualTo(401);

        Session b = newSession();
        b.fetchCsrf();
        MockHttpServletResponse bad = b.json(HttpMethod.POST, "/api/v1/auth/login", Map.of("email", a.email, "password", "wrong-passw0rd"));
        assertThat(bad.getStatus()).isEqualTo(401);
        assertThat(b.read(bad).get("code").asText()).isEqualTo("INVALID_CREDENTIALS");

        MockHttpServletResponse ok = b.json(HttpMethod.POST, "/api/v1/auth/login",
                Map.of("email", a.email.toUpperCase(), "password", Session.PASSWORD));
        assertThat(ok.getStatus()).isEqualTo(200);
        assertThat(b.getJson("/api/v1/users/me").get("email").asText()).isEqualTo(a.email);
    }

    @Test
    void duplicateEmailAndInvalidInputAreRejectedWithFieldErrors() throws Exception {
        Session a = newSession().registered("A");
        Session b = newSession();
        b.fetchCsrf();
        MockHttpServletResponse dup = b.json(HttpMethod.POST, "/api/v1/auth/register",
                Map.of("email", a.email, "password", Session.PASSWORD, "fullName", "B"));
        assertThat(dup.getStatus()).isEqualTo(409);

        MockHttpServletResponse invalid = b.json(HttpMethod.POST, "/api/v1/auth/register",
                Map.of("email", "not-an-email", "password", "short", "fullName", ""));
        assertThat(invalid.getStatus()).isEqualTo(400);
        JsonNode body = b.read(invalid);
        assertThat(body.get("code").asText()).isEqualTo("VALIDATION_ERROR");
        assertThat(body.get("fieldErrors").findValuesAsText("field")).contains("email", "password", "fullName");
    }

    @Test
    void stateChangingRequestsRequireCsrfToken() throws Exception {
        Session s = newSession().registered("A").withoutCsrfHeader();
        MockHttpServletResponse r = s.json(HttpMethod.PATCH, "/api/v1/users/me", Map.of("fullName", "Hacked"));
        assertThat(r.getStatus()).isEqualTo(403);
        assertThat(s.read(r).get("code").asText()).isEqualTo("CSRF_INVALID");

        Session anon = newSession().withoutCsrfHeader();
        anon.fetchCsrf();
        assertThat(anon.json(HttpMethod.POST, "/api/v1/auth/login", Map.of("email", "x@example.test", "password", "y"))
                .getStatus()).isEqualTo(403);
    }

    @Test
    void passwordChangeAndRevokeInvalidateExistingSessions() throws Exception {
        Session s = newSession().registered("A");
        Cookie oldSession = s.cookie("careerlens_session");

        MockHttpServletResponse change = s.json(HttpMethod.POST, "/api/v1/users/me/password",
                Map.of("currentPassword", Session.PASSWORD, "newPassword", "Another-Passw0rd-2"));
        assertThat(change.getStatus()).isEqualTo(204);
        assertThat(s.perform(get("/api/v1/users/me")).getStatus()).as("new cookie issued to this device").isEqualTo(200);

        Session stolen = newSession();
        stolen.setCookie(oldSession);
        assertThat(stolen.perform(get("/api/v1/users/me")).getStatus()).as("old token rejected").isEqualTo(401);

        Cookie beforeRevoke = s.cookie("careerlens_session");
        assertThat(s.post("/api/v1/users/me/sessions/revoke").getStatus()).isEqualTo(204);
        Session other = newSession();
        other.setCookie(beforeRevoke);
        assertThat(other.perform(get("/api/v1/users/me")).getStatus()).isEqualTo(401);
    }

    @Test
    void forgedOrMalformedSessionCookieIsRejected() throws Exception {
        Session s = newSession();
        s.setCookie(new Cookie("careerlens_session", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0."));
        MockHttpServletResponse r = s.perform(get("/api/v1/comparisons"));
        assertThat(r.getStatus()).isEqualTo(401);
        assertThat(s.read(r).get("code").asText()).isEqualTo("UNAUTHORIZED");
    }

    @Test
    void securityHeadersArePresent() throws Exception {
        MockHttpServletResponse r = newSession().perform(get("/api/v1/system/status"));
        assertThat(r.getStatus()).isEqualTo(200);
        assertThat(r.getHeader("Content-Security-Policy")).contains("default-src 'self'").contains("frame-ancestors 'none'");
        assertThat(r.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(r.getHeader("X-Frame-Options")).isEqualTo("DENY");
        assertThat(r.getHeader("Referrer-Policy")).isNotBlank();
        assertThat(r.getHeader("X-Request-Id")).isNotBlank();
    }

    @Test
    void systemStatusReportsAiHealthWithoutAuthentication() throws Exception {
        JsonNode status = newSession().getJson("/api/v1/system/status");
        assertThat(status.get("backend").asText()).isEqualTo("UP");
        assertThat(status.get("aiService").get("modelLoaded").asBoolean()).isTrue();
        assertThat(status.get("aiService").get("scoringVersion").asText()).isEqualTo("1.0.0");
    }

    @Test
    void accountDeletionRequiresPasswordAndRemovesData() throws Exception {
        Session s = newSession().registered("A");
        assertThat(s.json(HttpMethod.DELETE, "/api/v1/users/me", Map.of("password", "wrong-passw0rd")).getStatus())
                .isIn(400, 401, 403);
        assertThat(s.json(HttpMethod.DELETE, "/api/v1/users/me", Map.of("password", Session.PASSWORD)).getStatus())
                .isEqualTo(204);
        assertThat(jdbc.queryForObject("select count(*) from users where email = ?", Integer.class, s.email)).isZero();
    }
}
