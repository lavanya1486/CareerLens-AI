package com.careerlens.comparison;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.careerlens.ai.AiDtos;
import com.careerlens.common.error.ApiException;
import com.careerlens.comparison.dto.ComparisonDetail;
import com.careerlens.comparison.dto.ComparisonFilter;
import com.careerlens.resume.Resume;
import com.careerlens.resume.ResumeSource;
import com.careerlens.support.TestData;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Sort;

@ExtendWith(MockitoExtension.class)
class ComparisonServiceTest {

    @Mock ComparisonRepository comparisons;
    @Mock AnalysisResultRepository results;
    @Mock ComparisonSkillRepository skills;

    private final ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());

    private ComparisonService service() {
        return new ComparisonService(comparisons, results, skills, mapper);
    }

    private static Resume resume(UUID userId) {
        return new Resume(userId, "Ananya - backend", ResumeSource.TEXT, null, null, "x".repeat(200));
    }

    @Test
    @SuppressWarnings("unchecked")
    void createDraftPersistsScoresVersionsJsonAndDeduplicatedSkillRows() throws Exception {
        UUID userId = UUID.randomUUID();
        AiDtos.AnalysisResult result = TestData.analysisResult();

        ComparisonDetail detail = service().createDraft(userId, resume(userId), "JD text", "Java Intern", "Northwind", result);

        ArgumentCaptor<Comparison> saved = ArgumentCaptor.forClass(Comparison.class);
        verify(comparisons).save(saved.capture());
        Comparison c = saved.getValue();
        assertThat(c.getName()).isEqualTo("Java Intern at Northwind");
        assertThat(c.isSaved()).isFalse();
        assertThat(c.getUserId()).isEqualTo(userId);
        assertThat(c.getOverallScore()).isEqualByComparingTo(BigDecimal.valueOf(result.overallScore()).setScale(1, java.math.RoundingMode.HALF_UP));
        assertThat(c.getScoringVersion()).isEqualTo(result.scoringVersion());
        assertThat(c.getInputFingerprint()).isEqualTo(result.inputFingerprint());

        ArgumentCaptor<AnalysisResultEntity> json = ArgumentCaptor.forClass(AnalysisResultEntity.class);
        verify(results).save(json.capture());
        AiDtos.AnalysisResult roundTrip = mapper.readValue(json.getValue().getResultJson(), AiDtos.AnalysisResult.class);
        assertThat(roundTrip).isEqualTo(result);

        ArgumentCaptor<Iterable<ComparisonSkill>> rows = ArgumentCaptor.forClass(Iterable.class);
        verify(skills).saveAll(rows.capture());
        List<ComparisonSkill> list = new ArrayList<>();
        rows.getValue().forEach(list::add);
        long distinct = result.skillMatches().stream().map(m -> m.skill().toLowerCase()).distinct().count();
        assertThat(list).hasSize((int) distinct);
        assertThat(detail.saved()).isFalse();
    }

    @Test
    void draftNameFallsBackToExtractedTitleThenUntitled() throws Exception {
        UUID userId = UUID.randomUUID();
        AiDtos.AnalysisResult result = TestData.analysisResult();
        ComparisonDetail withSuggested = service().createDraft(userId, resume(userId), "JD", " ", null, result);
        assertThat(withSuggested.name()).isEqualTo(result.requirements().suggestedTitle());

        ObjectMapper snake = TestData.strictSnakeMapper();
        ObjectNode tree = (ObjectNode) snake.readTree(TestData.fixture("analysis-response.json"));
        ((ObjectNode) tree.get("requirements")).putNull("suggested_title");
        AiDtos.AnalysisResult untitled = snake.treeToValue(tree, AiDtos.AnalysisResult.class);
        assertThat(service().createDraft(userId, resume(userId), "JD", null, "Acme", untitled).name())
                .isEqualTo("Untitled comparison");
    }

    @Test
    void sortIsWhitelisted() {
        assertThat(ComparisonService.parseSort(null).getOrderFor("createdAt").getDirection()).isEqualTo(Sort.Direction.DESC);
        assertThat(ComparisonService.parseSort("overallScore,asc").getOrderFor("overallScore").getDirection())
                .isEqualTo(Sort.Direction.ASC);
        assertThatThrownBy(() -> ComparisonService.parseSort("userId,asc")).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> ComparisonService.parseSort("resultJson")).isInstanceOf(ApiException.class);
    }

    @Test
    void invalidFilterRangesAreRejectedBeforeQuerying() {
        UUID userId = UUID.randomUUID();
        ComparisonFilter filter = new ComparisonFilter(null, null, 80.0, 20.0, null, null);
        assertThatThrownBy(() -> service().search(userId, filter, 0, 10, null))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("INVALID_FILTER"));
        verify(comparisons, never()).findAll(any(org.springframework.data.jpa.domain.Specification.class),
                any(org.springframework.data.domain.Pageable.class));
    }
}
