package com.careerlens.ai;

import com.careerlens.common.web.RequestIdFilter;
import com.careerlens.config.AppProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpTimeoutException;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * HTTP client for the Python NLP service.
 *
 * <ul>
 *   <li>Connect and read timeouts - never blocks indefinitely.</li>
 *   <li>Retries only transient failures (connection errors, 502, 503) with a fixed backoff.</li>
 *   <li>4xx responses describing invalid documents are passed through with their message.</li>
 *   <li>Never logs request/response bodies (they contain resume text).</li>
 * </ul>
 */
@Component
public class AiServiceClient {

    private static final Logger log = LoggerFactory.getLogger(AiServiceClient.class);

    private final RestClient restClient;
    private final ObjectMapper mapper;
    private final AppProperties.AiService config;

    public AiServiceClient(AppProperties props, RestClient.Builder builder) {
        this.config = props.aiService();
        this.mapper = createMapper();
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(config.connectTimeout())
                .version(HttpClient.Version.HTTP_1_1)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(config.readTimeout());
        RestClient.Builder b = builder.clone()
                .baseUrl(config.baseUrl())
                .requestFactory(factory)
                .messageConverters(converters -> {
                    converters.removeIf(c -> c instanceof MappingJackson2HttpMessageConverter);
                    converters.add(new MappingJackson2HttpMessageConverter(mapper));
                });
        if (config.apiKey() != null && !config.apiKey().isBlank()) {
            b.defaultHeader("X-Internal-Api-Key", config.apiKey());
        }
        this.restClient = b.build();
    }

    static ObjectMapper createMapper() {
        return new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    }

    public AiDtos.AnalysisResult analyze(AiDtos.AnalyzeRequest request) {
        return execute("analyze", () -> restClient.post().uri("/v1/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .header(RequestIdFilter.HEADER, requestId())
                .body(request)
                .retrieve()
                .body(AiDtos.AnalysisResult.class));
    }

    public AiDtos.JobRequirements extractJob(String jobDescription) {
        return execute("job_extract", () -> restClient.post().uri("/v1/job/extract")
                .contentType(MediaType.APPLICATION_JSON)
                .header(RequestIdFilter.HEADER, requestId())
                .body(new AiDtos.JobExtractRequest(jobDescription))
                .retrieve()
                .body(AiDtos.JobRequirements.class));
    }

    public AiDtos.ResumeStructure parseResume(String resumeText) {
        return execute("resume_parse", () -> restClient.post().uri("/v1/resume/parse")
                .contentType(MediaType.APPLICATION_JSON)
                .header(RequestIdFilter.HEADER, requestId())
                .body(new AiDtos.ResumeParseRequest(resumeText))
                .retrieve()
                .body(AiDtos.ResumeStructure.class));
    }

    public AiDtos.ResumeExtractResponse extractPdf(byte[] pdf, String filename) {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("file", new ByteArrayResource(pdf) {
            @Override
            public String getFilename() {
                return filename;
            }
        });
        return execute("resume_extract", () -> restClient.post().uri("/v1/resume/extract")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .header(RequestIdFilter.HEADER, requestId())
                .body(form)
                .retrieve()
                .body(AiDtos.ResumeExtractResponse.class));
    }

    public AiDtos.Health health() {
        return restClient.get().uri("/health").retrieve().body(AiDtos.Health.class);
    }

    private static String requestId() {
        String id = MDC.get(RequestIdFilter.MDC_KEY);
        return id != null ? id : "background";
    }

    <T> T execute(String operation, Supplier<T> call) {
        int attempts = Math.max(1, config.maxAttempts());
        for (int attempt = 1; ; attempt++) {
            long start = System.nanoTime();
            try {
                T result = call.get();
                if (result == null) {
                    throw new AiServiceException(HttpStatus.BAD_GATEWAY, "AI_SERVICE_BAD_RESPONSE",
                            "The analysis service returned an empty response.");
                }
                log.info("ai_call_ok operation={} attempt={} durationMs={}", operation, attempt, elapsed(start));
                return result;
            } catch (RestClientResponseException e) {
                HttpStatusCode status = e.getStatusCode();
                boolean transientError = status.value() == 502 || status.value() == 503;
                log.warn("ai_call_failed operation={} attempt={} status={} durationMs={}", operation, attempt,
                        status.value(), elapsed(start));
                if (transientError && attempt < attempts) {
                    backoff();
                    continue;
                }
                throw translate(e);
            } catch (ResourceAccessException e) {
                boolean timeout = isTimeout(e);
                log.warn("ai_call_io_error operation={} attempt={} timeout={} durationMs={}", operation, attempt,
                        timeout, elapsed(start));
                if (timeout) {
                    throw AiServiceException.timeout(e);
                }
                if (attempt < attempts) {
                    backoff();
                    continue;
                }
                throw AiServiceException.unavailable(e);
            }
        }
    }

    private AiServiceException translate(RestClientResponseException e) {
        int status = e.getStatusCode().value();
        AiDtos.ErrorBody body = null;
        try {
            body = mapper.readValue(e.getResponseBodyAsByteArray(), AiDtos.ErrorBody.class);
        } catch (IOException | RuntimeException parseError) {
            log.debug("ai_error_body_unparseable status={}", status);
        }
        String code = body != null && body.code() != null ? body.code() : "AI_SERVICE_ERROR";
        if (status == 413 || status == 415 || status == 422) {
            String message = body != null && body.message() != null ? body.message() : "The document could not be processed.";
            return new AiServiceException(HttpStatus.valueOf(status), code, message, e);
        }
        if (status == 504) {
            return AiServiceException.timeout(e);
        }
        if (status == 401 || status == 403) {
            log.error("ai_service_rejected_api_key - check AI_SERVICE_API_KEY on both services");
        }
        return AiServiceException.unavailable(e);
    }

    private static boolean isTimeout(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof java.net.http.HttpConnectTimeoutException || t instanceof java.net.ConnectException) {
                return false;
            }
            if (t instanceof HttpTimeoutException || t instanceof java.net.SocketTimeoutException) {
                return true;
            }
        }
        return false;
    }

    private void backoff() {
        try {
            Thread.sleep(config.retryBackoff().toMillis());
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw AiServiceException.unavailable(ie);
        }
    }

    private static long elapsed(long start) {
        return (System.nanoTime() - start) / 1_000_000;
    }
}
