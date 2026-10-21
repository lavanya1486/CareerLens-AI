package com.careerlens.report;

import static org.assertj.core.api.Assertions.assertThat;

import com.careerlens.comparison.dto.ComparisonDetail;
import com.careerlens.support.TestData;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

class PdfReportServiceTest {

    private final PdfReportService service = new PdfReportService();

    @Test
    void reportContainsAllSectionsFromStoredData() throws Exception {
        ComparisonDetail detail = TestData.comparisonDetail();

        byte[] pdf = service.render(detail);

        assertThat(new String(pdf, 0, 5)).isEqualTo("%PDF-");
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            assertThat(doc.getNumberOfPages()).isGreaterThan(1);
            String text = new PDFTextStripper().getText(doc).replaceAll("\\s+", " ");
            assertThat(text).contains(
                    "Java Backend Developer Intern at Northwind Fintech",
                    "Northwind Fintech",
                    "Component scores",
                    "Matching skills",
                    "Missing required skills",
                    "Missing preferred skills",
                    "Partial matches",
                    "Relevant projects",
                    "Supporting evidence",
                    "Actionable recommendations",
                    "Scoring methodology",
                    "Model and scoring limitations",
                    "not a probability of being interviewed or hired",
                    "Scoring " + detail.scoringVersion(),
                    "Page 1");
            String score = String.format(java.util.Locale.ROOT, "%.0f", detail.result().overallScore());
            assertThat(text).contains(score);
            detail.result().skillMatches().stream().filter(m -> m.status().equals("missing")).forEach(m ->
                    assertThat(text).contains(m.skill()));
        }
    }

    @Test
    void sanitisesCharactersOutsideTheBuiltInFontEncoding() {
        assertThat(PdfReportService.clean("Score \u2265 75 \u2192 strong")).isEqualTo("Score >= 75 -> strong");
        assertThat(PdfReportService.clean("Na\u00efve caf\u00e9")).isEqualTo("Na\u00efve caf\u00e9");
        assertThat(PdfReportService.clean("\u0141\u00f3d\u017a")).isEqualTo("L\u00f3dz");
        assertThat(PdfReportService.clean("\u4e2d\u6587 emoji \ud83d\ude80")).isEqualTo("?? emoji ?");
        assertThat(PdfReportService.clean("line1\nline2\u0007")).isEqualTo("line1 line2");
        assertThat(PdfReportService.clean(null)).isEmpty();
    }

    @Test
    void rendersHostileUnicodeWithoutFailing() throws Exception {
        ComparisonDetail d = TestData.comparisonDetail();
        ComparisonDetail hostile = new ComparisonDetail(d.id(), "\u65e5\u672c <script>alert(1)</script> \ud83d\ude80 \u202e",
                d.jobTitle(), "\u0000Comp\u0001any", d.resumeId(), d.resumeTitle(), true, d.overallScore(), d.scoreBand(),
                d.scoringVersion(), d.analysisVersion(), d.taxonomyVersion(), d.modelName(), d.jobDescription(),
                d.createdAt(), d.updatedAt(), d.savedAt(), d.result());
        try (PDDocument doc = Loader.loadPDF(service.render(hostile))) {
            assertThat(new PDFTextStripper().getText(doc)).contains("<script>alert(1)</script>");
        }
    }
}
