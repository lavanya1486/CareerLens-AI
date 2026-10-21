package com.careerlens.resume;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.careerlens.common.error.ApiException;
import com.careerlens.support.TestData;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;

class ResumeUploadValidationTest {

    private static void assertRejected(MockMultipartFile file, HttpStatus status, String code) {
        assertThatThrownBy(() -> ResumeService.validatePdf(file))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> {
                    ApiException ex = (ApiException) e;
                    assertThat(ex.getStatus()).isEqualTo(status);
                    assertThat(ex.getCode()).isEqualTo(code);
                });
    }

    @Test
    void acceptsRealPdf() {
        byte[] pdf = TestData.demoResumePdf();
        assertThat(ResumeService.validatePdf(new MockMultipartFile("file", "resume.pdf", "application/pdf", pdf)))
                .isEqualTo(pdf);
    }

    @Test
    void rejectsWrongExtension() {
        assertRejected(new MockMultipartFile("file", "resume.docx", "application/pdf", TestData.demoResumePdf()),
                HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_FILE_TYPE");
    }

    @Test
    void rejectsWrongContentType() {
        assertRejected(new MockMultipartFile("file", "resume.pdf", "image/png", TestData.demoResumePdf()),
                HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_FILE_TYPE");
    }

    @Test
    void rejectsRenamedNonPdfByMagicBytes() {
        assertRejected(new MockMultipartFile("file", "resume.pdf", "application/pdf", "PK\u0003\u0004 zip".getBytes()),
                HttpStatus.UNSUPPORTED_MEDIA_TYPE, "NOT_A_PDF");
    }

    @Test
    void rejectsEmptyFile() {
        assertRejected(new MockMultipartFile("file", "resume.pdf", "application/pdf", new byte[0]),
                HttpStatus.BAD_REQUEST, "EMPTY_FILE");
    }

    @Test
    void rejectsOversizedFile() {
        byte[] big = new byte[(int) ResumeService.MAX_PDF_BYTES + 1];
        System.arraycopy("%PDF-".getBytes(), 0, big, 0, 5);
        assertRejected(new MockMultipartFile("file", "resume.pdf", "application/pdf", big),
                HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE");
    }

    @Test
    void sanitisesFilenames() {
        assertThat(ResumeService.safeFilename("../../etc/passwd.pdf")).doesNotContain("/").doesNotContain("..");
        assertThat(ResumeService.safeFilename("C:\\Users\\me\\My Resume<script>.pdf")).doesNotContain("\\")
                .doesNotContain("<").endsWith(".pdf");
        assertThat(ResumeService.safeFilename(null)).isNotBlank();
    }
}
