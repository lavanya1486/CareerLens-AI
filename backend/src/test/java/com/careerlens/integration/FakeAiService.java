package com.careerlens.integration;

import com.careerlens.support.TestData;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;

/**
 * Stand-in for the Python service at the HTTP boundary. Serves responses recorded from the real service.
 * Test-only markers inside the job description let a test choose the score ("[score:42]") or force an
 * upstream failure ("[fail:503]").
 */
final class FakeAiService {

    static final MockWebServer SERVER = new MockWebServer();
    static final AtomicInteger ANALYZE_CALLS = new AtomicInteger();
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Pattern SCORE = Pattern.compile("\\[score:(\\d{1,3})]");
    private static final Pattern FAIL = Pattern.compile("\\[fail:(\\d{3})]");

    static {
        SERVER.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                try {
                    return handle(request);
                } catch (IOException e) {
                    return new MockResponse().setResponseCode(500);
                }
            }
        });
        try {
            SERVER.start();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private FakeAiService() {}

    static String baseUrl() {
        return SERVER.url("/").toString();
    }

    private static MockResponse json(int status, String body) {
        return new MockResponse().setResponseCode(status).setHeader("Content-Type", "application/json").setBody(body);
    }

    private static MockResponse handle(RecordedRequest request) throws IOException {
        if (!"test-internal-key".equals(request.getHeader("X-Internal-Api-Key"))) {
            return json(401, "{\"code\":\"UNAUTHORIZED\",\"message\":\"Invalid internal API key.\",\"details\":[]}");
        }
        String path = request.getPath() == null ? "" : request.getPath();
        switch (path) {
            case "/health":
                return json(200, "{\"status\":\"ok\",\"service\":\"careerlens-ai\",\"model_loaded\":true,"
                        + "\"model\":\"sentence-transformers/all-MiniLM-L6-v2\",\"taxonomy_version\":\"2026.10.2\","
                        + "\"scoring_version\":\"1.0.0\"}");
            case "/v1/resume/extract": {
                String body = request.getBody().readUtf8();
                if (body.contains("%PDF-1.4 broken")) {
                    return json(422, TestData.fixture("error-invalid-document.json"));
                }
                return json(200, TestData.fixture("resume-extract-response.json"));
            }
            case "/v1/resume/parse":
                return json(200, TestData.fixture("resume-parse-response.json"));
            case "/v1/job/extract":
                return json(200, TestData.fixture("job-extract-response.json"));
            case "/v1/analyze": {
                ANALYZE_CALLS.incrementAndGet();
                JsonNode req = MAPPER.readTree(request.getBody().readUtf8());
                String jd = req.path("job_description").asText();
                Matcher fail = FAIL.matcher(jd);
                if (fail.find()) {
                    return json(Integer.parseInt(fail.group(1)), "{\"code\":\"MODEL_NOT_READY\",\"message\":\"x\",\"details\":[]}");
                }
                ObjectNode result = (ObjectNode) MAPPER.readTree(TestData.fixture("analysis-response.json"));
                Matcher score = SCORE.matcher(jd);
                if (score.find()) {
                    double s = Double.parseDouble(score.group(1));
                    result.put("overall_score", s);
                    result.put("score_band", s >= 75 ? "strong" : s >= 55 ? "good" : s >= 35 ? "partial" : "limited");
                }
                return json(200, MAPPER.writeValueAsString(result));
            }
            default:
                return json(404, "{\"code\":\"NOT_FOUND\",\"message\":\"Unknown path\",\"details\":[]}");
        }
    }
}
