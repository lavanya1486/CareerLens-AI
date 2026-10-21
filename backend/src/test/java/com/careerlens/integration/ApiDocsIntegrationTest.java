package com.careerlens.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;

class ApiDocsIntegrationTest extends IntegrationTestBase {

    @Test
    void openApiDocumentDescribesTheApi() throws Exception {
        Session s = newSession();
        JsonNode doc = s.getJson("/api/v3/api-docs");
        assertThat(doc.get("openapi").asText()).startsWith("3.");
        assertThat(doc.get("paths").has("/api/v1/analyses")).isTrue();
        assertThat(doc.get("paths").has("/api/v1/comparisons/{id}/report.pdf")).isTrue();
        assertThat(doc.get("paths").has("/api/v1/dashboard")).isTrue();
    }

    @Test
    void swaggerUiIsServed() throws Exception {
        Session s = newSession();
        MockHttpServletResponse r = s.perform(get("/api/docs"));
        String location = r.getRedirectedUrl() != null ? r.getRedirectedUrl() : r.getHeader("Location");
        assertThat(r.getStatus()).as("redirect to UI").isEqualTo(302);
        MockHttpServletResponse ui = s.perform(get(location));
        assertThat(ui.getStatus()).as(location).isEqualTo(200);
        assertThat(ui.getContentAsString()).contains("swagger-ui");
    }
}
