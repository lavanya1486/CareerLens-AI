package com.careerlens.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.careerlens.support.TestData;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.ServerSocket;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.TimeUnit;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClient;

class AiServiceClientTest {

    private MockWebServer server;
    private AiServiceClient client;

    @BeforeEach
    void setUp() throws IOException {
        server = new MockWebServer();
        server.start();
        client = new AiServiceClient(TestData.props(server.url("/").toString(), 10), RestClient.builder());
    }

    @AfterEach
    void tearDown() throws IOException {
        server.shutdown();
    }

    private static MockResponse json(int status, String body) {
        return new MockResponse().setResponseCode(status).setHeader("Content-Type", "application/json").setBody(body);
    }

    private static AiDtos.AnalyzeRequest request() {
        return new AiDtos.AnalyzeRequest("resume text", "job description",
                List.of(new AiDtos.RequirementOverride("PostgreSQL", "required", List.of("MySQL"))),
                LocalDate.of(2026, 10, 18));
    }

    @Test
    void sendsSnakeCaseBodyAndApiKeyAndMapsRealResponse() throws Exception {
        server.enqueue(json(200, TestData.fixture("analysis-response.json")));

        AiDtos.AnalysisResult result = client.analyze(request());

        assertThat(result.overallScore()).isBetween(0.0, 100.0);
        assertThat(result.components()).hasSize(6);
        assertThat(result.skillMatches()).isNotEmpty();
        RecordedRequest recorded = server.takeRequest(1, TimeUnit.SECONDS);
        assertThat(recorded.getPath()).isEqualTo("/v1/analyze");
        assertThat(recorded.getHeader("X-Internal-Api-Key")).isEqualTo("test-internal-key");
        JsonNode body = new ObjectMapper().readTree(recorded.getBody().readUtf8());
        assertThat(body.has("resume_text")).isTrue();
        assertThat(body.has("job_description")).isTrue();
        assertThat(body.get("reference_date").asText()).isEqualTo("2026-10-18");
        assertThat(body.get("requirements").get(0).get("alternatives").get(0).asText()).isEqualTo("MySQL");
    }

    @Test
    void retriesOnceOnServiceUnavailableThenSucceeds() {
        server.enqueue(json(503, "{\"code\":\"MODEL_NOT_READY\",\"message\":\"loading\",\"details\":[]}"));
        server.enqueue(json(200, TestData.fixture("job-extract-response.json")));

        AiDtos.JobRequirements job = client.extractJob("A job description");

        assertThat(job.skills()).isNotEmpty();
        assertThat(server.getRequestCount()).isEqualTo(2);
    }

    @Test
    void givesUpAfterMaxAttemptsWithUnavailableAndNoFallbackData() {
        server.enqueue(json(503, "{}"));
        server.enqueue(json(503, "{}"));

        assertThatThrownBy(() -> client.analyze(request()))
                .isInstanceOf(AiServiceException.class)
                .satisfies(e -> {
                    assertThat(((AiServiceException) e).getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                    assertThat(((AiServiceException) e).getCode()).isEqualTo("AI_SERVICE_UNAVAILABLE");
                });
        assertThat(server.getRequestCount()).isEqualTo(2);
    }

    @Test
    void documentErrorsPassThroughWithoutRetry() {
        server.enqueue(json(422, TestData.fixture("error-invalid-document.json")));

        assertThatThrownBy(() -> client.extractPdf("%PDF-1.4 broken".getBytes(), "x.pdf"))
                .isInstanceOf(AiServiceException.class)
                .satisfies(e -> {
                    AiServiceException ex = (AiServiceException) e;
                    assertThat(ex.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                    assertThat(ex.getCode()).isEqualTo("MALFORMED_DOCUMENT");
                    assertThat(ex.getMessage()).contains("could not be read");
                });
        assertThat(server.getRequestCount()).isEqualTo(1);
    }

    @Test
    void readTimeoutFailsFastWith504AndIsNotRetried() {
        server.enqueue(json(200, TestData.fixture("analysis-response.json")).setHeadersDelay(3, TimeUnit.SECONDS));

        assertThatThrownBy(() -> client.analyze(request()))
                .isInstanceOf(AiServiceException.class)
                .satisfies(e -> assertThat(((AiServiceException) e).getCode()).isEqualTo("AI_SERVICE_TIMEOUT"));
        assertThat(server.getRequestCount()).isEqualTo(1);
    }

    @Test
    void connectionRefusedIsRetriedThenReportedUnavailable() throws IOException {
        int closedPort;
        try (ServerSocket s = new ServerSocket(0)) {
            closedPort = s.getLocalPort();
        }
        AiServiceClient offline = new AiServiceClient(TestData.props("http://127.0.0.1:" + closedPort, 10),
                RestClient.builder());

        assertThatThrownBy(() -> offline.parseResume("text"))
                .isInstanceOf(AiServiceException.class)
                .satisfies(e -> assertThat(((AiServiceException) e).getCode()).isEqualTo("AI_SERVICE_UNAVAILABLE"));
    }

    @Test
    void emptyBodyIsTreatedAsBadResponse() {
        server.enqueue(new MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json"));

        assertThatThrownBy(() -> client.extractJob("A job description"))
                .isInstanceOf(AiServiceException.class)
                .satisfies(e -> assertThat(((AiServiceException) e).getStatus()).isEqualTo(HttpStatus.BAD_GATEWAY));
    }

    @Test
    void unauthorisedIsNotRetriedAndNotLeaked() {
        server.enqueue(json(401, "{\"code\":\"UNAUTHORIZED\",\"message\":\"bad key\",\"details\":[]}"));

        assertThatThrownBy(() -> client.extractJob("A job description"))
                .isInstanceOf(AiServiceException.class)
                .satisfies(e -> assertThat(((AiServiceException) e).getMessage()).doesNotContain("bad key"));
        assertThat(server.getRequestCount()).isEqualTo(1);
    }
}
