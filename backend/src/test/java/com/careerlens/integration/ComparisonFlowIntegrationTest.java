package com.careerlens.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

import com.careerlens.comparison.DraftCleanupJob;
import com.careerlens.support.TestData;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;

class ComparisonFlowIntegrationTest extends IntegrationTestBase {

    private static final String JD = TestData.fixture("job-java-backend-intern.txt");

    @Autowired DraftCleanupJob cleanupJob;

    private String uploadResume(Session s) throws Exception {
        MockHttpServletResponse r = s.perform(multipart("/api/v1/resumes/upload")
                .file(new MockMultipartFile("file", "ananya-rao.pdf", "application/pdf", TestData.demoResumePdf()))
                .param("title", "Ananya - backend"));
        assertThat(r.getStatus()).as(r.getContentAsString()).isEqualTo(201);
        return s.read(r).get("id").asText();
    }

    private JsonNode analyse(Session s, String resumeId, String jd, String title) throws Exception {
        MockHttpServletResponse r = s.json(HttpMethod.POST, "/api/v1/analyses",
                Map.of("resumeId", resumeId, "jobDescription", jd, "jobTitle", title, "company", "Northwind"));
        assertThat(r.getStatus()).as(r.getContentAsString()).isEqualTo(201);
        return s.read(r);
    }

    private JsonNode save(Session s, String id) throws Exception {
        MockHttpServletResponse r = s.json(HttpMethod.PATCH, "/api/v1/comparisons/" + id, Map.of("saved", true));
        assertThat(r.getStatus()).isEqualTo(200);
        return s.read(r);
    }

    @Test
    void fullResumeToReportFlow() throws Exception {
        Session s = newSession().registered("Ananya");
        String resumeId = uploadResume(s);

        JsonNode resume = s.getJson("/api/v1/resumes/" + resumeId);
        assertThat(resume.get("sourceType").asText()).isEqualTo("PDF");
        assertThat(resume.get("pageCount").asInt()).isEqualTo(1);
        assertThat(resume.get("content").asText()).contains("Campus Library Management System");
        assertThat(resume.get("structure").get("detected")).isNotEmpty();

        MockHttpServletResponse edit = s.json(HttpMethod.PUT, "/api/v1/resumes/" + resumeId,
                Map.of("title", "Ananya - edited", "content", resume.get("content").asText() + "\nAlso familiar with Postman."));
        assertThat(edit.getStatus()).isEqualTo(200);
        assertThat(s.read(edit).get("content").asText()).endsWith("Also familiar with Postman.");

        MockHttpServletResponse extracted = s.json(HttpMethod.POST, "/api/v1/job-descriptions/extract", Map.of("jobDescription", JD));
        assertThat(extracted.getStatus()).isEqualTo(200);
        assertThat(s.read(extracted).get("skills")).isNotEmpty();

        JsonNode draft = analyse(s, resumeId, JD, "Java Backend Developer Intern");
        String id = draft.get("id").asText();
        assertThat(draft.get("saved").asBoolean()).isFalse();
        assertThat(draft.get("name").asText()).isEqualTo("Java Backend Developer Intern at Northwind");
        assertThat(draft.get("result").get("components")).hasSize(6);
        assertThat(jdbc.queryForObject("select count(*) from comparison_skills where comparison_id = ?::uuid", Integer.class, id))
                .isPositive();
        assertThat(s.getJson("/api/v1/comparisons").get("totalElements").asInt()).as("drafts are not listed").isZero();

        JsonNode saved = save(s, id);
        assertThat(saved.get("saved").asBoolean()).isTrue();
        assertThat(saved.get("savedAt").isNull()).isFalse();
        JsonNode renamed = s.read(s.json(HttpMethod.PATCH, "/api/v1/comparisons/" + id, Map.of("name", "Northwind - final")));
        assertThat(renamed.get("name").asText()).isEqualTo("Northwind - final");

        JsonNode list = s.getJson("/api/v1/comparisons");
        assertThat(list.get("totalElements").asInt()).isEqualTo(1);
        assertThat(list.get("content").get(0).get("name").asText()).isEqualTo("Northwind - final");

        JsonNode detail = s.getJson("/api/v1/comparisons/" + id);
        assertThat(detail.get("result").get("skillMatches")).isNotEmpty();
        assertThat(detail.get("jobDescription").asText()).isEqualTo(JD.strip());

        MockHttpServletResponse pdf = s.perform(get("/api/v1/comparisons/" + id + "/report.pdf"));
        assertThat(pdf.getStatus()).isEqualTo(200);
        assertThat(pdf.getContentType()).isEqualTo("application/pdf");
        assertThat(pdf.getHeader("Content-Disposition")).isEqualTo("attachment; filename=\"careerlens-northwind-final.pdf\"");
        assertThat(pdf.getHeader("Cache-Control")).contains("no-store");
        // Regression: the SPA sends an explicit Accept header. PDF-or-JSON must succeed; JSON-only is a 406, never a 500.
        MockHttpServletResponse spaPdf = s.perform(get("/api/v1/comparisons/" + id + "/report.pdf")
                .header("Accept", "application/pdf, application/json;q=0.9"));
        assertThat(spaPdf.getStatus()).isEqualTo(200);
        MockHttpServletResponse jsonOnly = s.perform(get("/api/v1/comparisons/" + id + "/report.pdf")
                .header("Accept", "application/json"));
        assertThat(jsonOnly.getStatus()).isEqualTo(406);
        assertThat(jsonOnly.getContentAsString()).contains("NOT_ACCEPTABLE");

        try (PDDocument doc = Loader.loadPDF(pdf.getContentAsByteArray())) {
            String text = new PDFTextStripper().getText(doc);
            assertThat(text).contains("Northwind - final").contains("Missing required skills").contains("Scoring methodology");
        }

        MockHttpServletResponse export = s.perform(get("/api/v1/comparisons/" + id + "/export.json"));
        assertThat(export.getStatus()).isEqualTo(200);
        JsonNode exported = s.read(export);
        assertThat(exported.get("exportFormat").asText()).isEqualTo("careerlens.comparison.v1");
        assertThat(exported.get("comparison").get("id").asText()).isEqualTo(id);

        assertThat(s.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .delete("/api/v1/comparisons/" + id)).getStatus()).isEqualTo(204);
        assertThat(s.perform(get("/api/v1/comparisons/" + id)).getStatus()).isEqualTo(404);
        assertThat(jdbc.queryForObject("select count(*) from comparison_skills where comparison_id = ?::uuid", Integer.class, id))
                .as("child rows cascade").isZero();
    }

    @Test
    void searchFilterSortPaginateAndDashboardAggregates() throws Exception {
        Session s = newSession().registered("Dash");
        String resumeId = uploadResume(s);
        int[] scores = {82, 47, 63, 30};
        String[] titles = {"Backend Engineer Intern", "Data Analyst Intern", "Java Developer Intern", "Frontend Intern"};
        for (int i = 0; i < scores.length; i++) {
            save(s, analyse(s, resumeId, JD + "\n[score:" + scores[i] + "]", titles[i]).get("id").asText());
        }
        analyse(s, resumeId, JD + "\n[score:99]", "Unsaved draft"); // drafts must never count

        JsonNode byScore = s.getJson("/api/v1/comparisons?sort=overallScore,desc&size=2&page=0");
        assertThat(byScore.get("totalElements").asInt()).isEqualTo(4);
        assertThat(byScore.get("totalPages").asInt()).isEqualTo(2);
        assertThat(byScore.get("content").findValuesAsText("overallScore")).containsExactly("82.0", "63.0");
        JsonNode page2 = s.getJson("/api/v1/comparisons?sort=overallScore,desc&size=2&page=1");
        assertThat(page2.get("content").findValuesAsText("overallScore")).containsExactly("47.0", "30.0");

        assertThat(s.getJson("/api/v1/comparisons?minScore=40&maxScore=70").get("totalElements").asInt()).isEqualTo(2);
        assertThat(s.getJson("/api/v1/comparisons?q=java").get("totalElements").asInt()).isEqualTo(1);
        assertThat(s.getJson("/api/v1/comparisons?jobTitle=intern").get("totalElements").asInt()).isEqualTo(4);
        assertThat(s.getJson("/api/v1/comparisons?q=%25").get("totalElements").asInt()).as("LIKE wildcard escaped").isZero();
        String today = java.time.LocalDate.now(java.time.ZoneOffset.UTC).toString();
        assertThat(s.getJson("/api/v1/comparisons?from=" + today + "&to=" + today).get("totalElements").asInt()).isEqualTo(4);
        assertThat(s.getJson("/api/v1/comparisons?to=2020-01-01").get("totalElements").asInt()).isZero();
        assertThat(s.perform(get("/api/v1/comparisons?sort=userId,asc")).getStatus()).isEqualTo(400);
        assertThat(s.perform(get("/api/v1/comparisons?minScore=90&maxScore=10")).getStatus()).isEqualTo(400);
        assertThat(s.perform(get("/api/v1/comparisons?size=500")).getStatus()).isEqualTo(400);

        JsonNode dash = s.getJson("/api/v1/dashboard");
        assertThat(dash.get("totalComparisons").asInt()).isEqualTo(4);
        assertThat(dash.get("averageScore").decimalValue()).isEqualByComparingTo("55.5");
        assertThat(dash.get("highestScore").decimalValue()).isEqualByComparingTo("82.0");
        assertThat(dash.get("highestScoreComparisonName").asText()).isEqualTo("Backend Engineer Intern at Northwind");
        assertThat(dash.get("resumeCount").asInt()).isEqualTo(1);
        assertThat(dash.get("recent")).hasSize(4);
        assertThat(dash.get("frequentlyMissingSkills")).isNotEmpty();
        assertThat(dash.get("frequentlyMissingSkills").get(0).get("count").asInt()).isEqualTo(4);
        assertThat(dash.get("mostRequestedSkills")).isNotEmpty();
        assertThat(dash.get("trend").get("scoringVersion").asText()).isEqualTo("1.0.0");
        assertThat(dash.get("trend").get("points")).hasSize(4);
        assertThat(dash.get("trend").get("excludedOtherVersions").asInt()).isZero();
        Map<String, Integer> bands = new java.util.HashMap<>();
        dash.get("scoreBands").forEach(b -> bands.put(b.get("band").asText(), b.get("count").asInt()));
        assertThat(bands).containsEntry("strong", 1).containsEntry("good", 1).containsEntry("partial", 1).containsEntry("limited", 1);
    }

    @Test
    void aiFailurePersistsNothingAndReturnsHonestError() throws Exception {
        Session s = newSession().registered("Fail");
        String resumeId = uploadResume(s);
        Integer before = jdbc.queryForObject("select count(*) from comparisons", Integer.class);

        MockHttpServletResponse r = s.json(HttpMethod.POST, "/api/v1/analyses",
                Map.of("resumeId", resumeId, "jobDescription", JD + "\n[fail:503]"));

        assertThat(r.getStatus()).isEqualTo(503);
        assertThat(s.read(r).get("code").asText()).isEqualTo("AI_SERVICE_UNAVAILABLE");
        assertThat(jdbc.queryForObject("select count(*) from comparisons", Integer.class)).isEqualTo(before);
    }

    @Test
    void uploadRejectionsAreSpecific() throws Exception {
        Session s = newSession().registered("Upload");
        MockHttpServletResponse fake = s.perform(multipart("/api/v1/resumes/upload")
                .file(new MockMultipartFile("file", "resume.pdf", "application/pdf", "hello, not a pdf".getBytes())));
        assertThat(fake.getStatus()).isEqualTo(415);
        assertThat(s.read(fake).get("code").asText()).isEqualTo("NOT_A_PDF");

        MockHttpServletResponse broken = s.perform(multipart("/api/v1/resumes/upload")
                .file(new MockMultipartFile("file", "resume.pdf", "application/pdf", "%PDF-1.4 broken".getBytes())));
        assertThat(broken.getStatus()).isEqualTo(422);
        assertThat(s.read(broken).get("code").asText()).isEqualTo("MALFORMED_DOCUMENT");
        assertThat(jdbc.queryForObject("select count(*) from resumes r join users u on u.id = r.user_id where u.email = ?",
                Integer.class, s.email)).isZero();

        MockHttpServletResponse shortText = s.json(HttpMethod.POST, "/api/v1/resumes", Map.of("title", "x", "content", "too short"));
        assertThat(shortText.getStatus()).isEqualTo(400);
    }

    @Test
    void draftRetentionPurgesOnlyExpiredUnsavedAnalyses() throws Exception {
        Session s = newSession().registered("Retention");
        String resumeId = uploadResume(s);
        String oldDraft = analyse(s, resumeId, JD, "Old draft").get("id").asText();
        String freshDraft = analyse(s, resumeId, JD, "Fresh draft").get("id").asText();
        String oldSaved = analyse(s, resumeId, JD, "Old saved").get("id").asText();
        save(s, oldSaved);
        Timestamp twoDaysAgo = Timestamp.from(Instant.now().minus(48, ChronoUnit.HOURS));
        for (String id : List.of(oldDraft, oldSaved)) {
            jdbc.update("update comparisons set created_at = ? where id = ?::uuid", twoDaysAgo, id);
        }

        assertThat(cleanupJob.purgeExpiredDrafts()).isGreaterThanOrEqualTo(1);

        assertThat(s.perform(get("/api/v1/comparisons/" + oldDraft)).getStatus()).isEqualTo(404);
        assertThat(jdbc.queryForObject("select count(*) from analysis_results where comparison_id = ?::uuid", Integer.class, oldDraft)).isZero();
        assertThat(s.perform(get("/api/v1/comparisons/" + freshDraft)).getStatus()).isEqualTo(200);
        assertThat(s.perform(get("/api/v1/comparisons/" + oldSaved)).getStatus()).isEqualTo(200);
    }

    @Test
    void deletingResumeKeepsSavedComparisons() throws Exception {
        Session s = newSession().registered("Keep");
        String resumeId = uploadResume(s);
        String id = analyse(s, resumeId, JD, "Keep me").get("id").asText();
        save(s, id);

        assertThat(s.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .delete("/api/v1/resumes/" + resumeId)).getStatus()).isEqualTo(204);

        JsonNode detail = s.getJson("/api/v1/comparisons/" + id);
        assertThat(detail.get("resumeId").isNull()).isTrue();
        assertThat(detail.get("resumeTitle").asText()).isEqualTo("Ananya - backend");
    }
}
