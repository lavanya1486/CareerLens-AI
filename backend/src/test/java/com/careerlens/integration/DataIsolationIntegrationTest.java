package com.careerlens.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

import com.careerlens.support.TestData;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockMultipartFile;

/** Verifies that changing an ID in the URL or body never exposes or modifies another user's data. */
class DataIsolationIntegrationTest extends IntegrationTestBase {

    @Test
    void secondUserCannotReadModifyOrUseFirstUsersData() throws Exception {
        Session owner = newSession().registered("Owner");
        String resumeId = owner.read(owner.perform(multipart("/api/v1/resumes/upload")
                .file(new MockMultipartFile("file", "r.pdf", "application/pdf", TestData.demoResumePdf())))).get("id").asText();
        String jd = TestData.fixture("job-java-backend-intern.txt");
        String cid = owner.read(owner.json(HttpMethod.POST, "/api/v1/analyses",
                Map.of("resumeId", resumeId, "jobDescription", jd))).get("id").asText();
        owner.json(HttpMethod.PATCH, "/api/v1/comparisons/" + cid, Map.of("saved", true));

        Session intruder = newSession().registered("Intruder");
        assertThat(intruder.perform(get("/api/v1/resumes/" + resumeId)).getStatus()).isEqualTo(404);
        assertThat(intruder.json(HttpMethod.PUT, "/api/v1/resumes/" + resumeId,
                Map.of("title", "pwned", "content", "x".repeat(200))).getStatus()).isEqualTo(404);
        assertThat(intruder.perform(delete("/api/v1/resumes/" + resumeId)).getStatus()).isEqualTo(404);
        assertThat(intruder.perform(get("/api/v1/comparisons/" + cid)).getStatus()).isEqualTo(404);
        assertThat(intruder.json(HttpMethod.PATCH, "/api/v1/comparisons/" + cid, Map.of("name", "pwned")).getStatus()).isEqualTo(404);
        assertThat(intruder.perform(delete("/api/v1/comparisons/" + cid)).getStatus()).isEqualTo(404);
        assertThat(intruder.perform(get("/api/v1/comparisons/" + cid + "/report.pdf")).getStatus()).isEqualTo(404);
        assertThat(intruder.perform(get("/api/v1/comparisons/" + cid + "/export.json")).getStatus()).isEqualTo(404);
        assertThat(intruder.json(HttpMethod.POST, "/api/v1/analyses", Map.of("resumeId", resumeId, "jobDescription", jd))
                .getStatus()).isEqualTo(404);

        assertThat(intruder.getJson("/api/v1/comparisons").get("totalElements").asInt()).isZero();
        assertThat(intruder.getJson("/api/v1/resumes")).isEmpty();
        assertThat(intruder.getJson("/api/v1/dashboard").get("totalComparisons").asInt()).isZero();

        // Owner's data is untouched.
        assertThat(owner.getJson("/api/v1/comparisons/" + cid).get("saved").asBoolean()).isTrue();
        assertThat(owner.getJson("/api/v1/resumes/" + resumeId).get("title").asText()).isNotEqualTo("pwned");
    }

    @Test
    void unauthenticatedAccessIsRejected() throws Exception {
        Session anon = newSession();
        for (String path : new String[] {"/api/v1/comparisons", "/api/v1/resumes", "/api/v1/dashboard", "/api/v1/users/me"}) {
            assertThat(anon.perform(get(path)).getStatus()).as(path).isEqualTo(401);
        }
    }
}
