package com.careerlens.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.careerlens.support.TestData;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/**
 * Deserialises responses recorded from the real Python service with FAIL_ON_UNKNOWN_PROPERTIES enabled,
 * so any field added or renamed on the Python side breaks this test instead of being silently dropped.
 */
class AiContractTest {

    private final ObjectMapper strict = TestData.strictSnakeMapper();

    @Test
    void analysisResponseMatchesJavaContract() throws Exception {
        AiDtos.AnalysisResult r = strict.readValue(TestData.fixture("analysis-response.json"), AiDtos.AnalysisResult.class);

        assertThat(r.scoringVersion()).isEqualTo("1.0.0");
        assertThat(r.model().name()).contains("MiniLM");
        assertThat(r.inputFingerprint()).hasSize(64);
        assertThat(r.components()).extracting(AiDtos.ComponentScore::key)
                .containsExactlyInAnyOrder("required_skills", "preferred_skills", "semantic", "projects", "experience",
                        "evidence");
        double weightSum = r.components().stream().filter(AiDtos.ComponentScore::available)
                .mapToDouble(AiDtos.ComponentScore::effectiveWeight).sum();
        assertThat(weightSum).isCloseTo(1.0, org.assertj.core.data.Offset.offset(0.01));
        double contributionSum = r.components().stream().mapToDouble(AiDtos.ComponentScore::contribution).sum();
        assertThat(contributionSum).isCloseTo(r.overallScore(), org.assertj.core.data.Offset.offset(0.2));
        assertThat(r.skillMatches()).allSatisfy(m -> {
            assertThat(m.status()).isIn("matched", "partial", "missing", "review");
            assertThat(m.importance()).isIn("required", "preferred");
            if (m.status().equals("matched")) {
                assertThat(m.resumeEvidence()).as("matched skill %s needs evidence", m.skill()).isNotEmpty();
            }
        });
        assertThat(r.limitations()).isNotEmpty();
    }

    @Test
    void otherResponsesMatchJavaContract() throws Exception {
        assertThat(strict.readValue(TestData.fixture("job-extract-response.json"), AiDtos.JobRequirements.class).skills())
                .isNotEmpty();
        AiDtos.ResumeExtractResponse extract = strict.readValue(TestData.fixture("resume-extract-response.json"),
                AiDtos.ResumeExtractResponse.class);
        assertThat(extract.pageCount()).isEqualTo(1);
        assertThat(extract.text()).contains("Ananya");
        assertThat(strict.readValue(TestData.fixture("resume-parse-response.json"), AiDtos.ResumeStructure.class)
                .detected()).contains("Skills", "Projects", "Experience");
        assertThat(strict.readValue(TestData.fixture("error-invalid-document.json"), AiDtos.ErrorBody.class).code())
                .isEqualTo("MALFORMED_DOCUMENT");
    }
}
