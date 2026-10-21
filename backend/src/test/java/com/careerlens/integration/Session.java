package com.careerlens.integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Browser-like client: keeps cookies between requests and echoes the CSRF cookie in X-XSRF-TOKEN. */
final class Session {

    static final String PASSWORD = "Integration-Passw0rd";
    private static final ObjectMapper JSON = new ObjectMapper();

    private final MockMvc mvc;
    private final Map<String, Cookie> cookies = new LinkedHashMap<>();
    private boolean sendCsrfHeader = true;
    String email;

    Session(MockMvc mvc) {
        this.mvc = mvc;
    }

    Session withoutCsrfHeader() {
        this.sendCsrfHeader = false;
        return this;
    }

    Cookie cookie(String name) {
        return cookies.get(name);
    }

    void setCookie(Cookie cookie) {
        cookies.put(cookie.getName(), cookie);
    }

    MockHttpServletResponse perform(MockHttpServletRequestBuilder builder) throws Exception {
        if (!cookies.isEmpty()) {
            builder.cookie(cookies.values().toArray(new Cookie[0]));
        }
        Cookie csrf = cookies.get("XSRF-TOKEN");
        if (sendCsrfHeader && csrf != null) {
            builder.header("X-XSRF-TOKEN", csrf.getValue());
        }
        MockHttpServletResponse response = mvc.perform(builder).andReturn().getResponse();
        for (Cookie c : response.getCookies()) {
            if (c.getMaxAge() == 0) {
                cookies.remove(c.getName());
            } else {
                cookies.put(c.getName(), c);
            }
        }
        return response;
    }

    MockHttpServletResponse json(HttpMethod method, String path, Object body) throws Exception {
        MockHttpServletRequestBuilder b = org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .request(method, path).accept(MediaType.APPLICATION_JSON);
        if (body != null) {
            b.contentType(MediaType.APPLICATION_JSON).content(JSON.writeValueAsString(body));
        }
        return perform(b);
    }

    JsonNode read(MockHttpServletResponse response) throws Exception {
        return JSON.readTree(response.getContentAsByteArray());
    }

    JsonNode getJson(String path) throws Exception {
        MockHttpServletResponse r = perform(get(path).accept(MediaType.APPLICATION_JSON));
        if (r.getStatus() != 200) {
            throw new AssertionError("GET " + path + " returned " + r.getStatus() + ": " + r.getContentAsString());
        }
        return read(r);
    }

    void fetchCsrf() throws Exception {
        perform(get("/api/v1/auth/csrf"));
    }

    /** Registers a fresh user with a unique email and returns the response. */
    MockHttpServletResponse register(String name) throws Exception {
        fetchCsrf();
        email = "it-" + UUID.randomUUID().toString().substring(0, 8) + "@example.test";
        return json(HttpMethod.POST, "/api/v1/auth/register",
                Map.of("email", email, "password", PASSWORD, "fullName", name));
    }

    Session registered(String name) throws Exception {
        MockHttpServletResponse r = register(name);
        if (r.getStatus() != 201) {
            throw new AssertionError("register failed " + r.getStatus() + ": " + r.getContentAsString());
        }
        return this;
    }

    MockHttpServletResponse post(String path) throws Exception {
        return perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path));
    }

}
