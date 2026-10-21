package com.careerlens.resume;

import com.careerlens.ai.AiDtos;
import com.careerlens.ai.AiServiceClient;
import com.careerlens.common.error.ApiException;
import com.careerlens.config.AppProperties;
import com.careerlens.resume.dto.ResumeDetail;
import com.careerlens.resume.dto.ResumeSummary;
import com.careerlens.resume.dto.SaveResumeRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ResumeService {

    private static final Logger log = LoggerFactory.getLogger(ResumeService.class);
    static final long MAX_PDF_BYTES = 5L * 1024 * 1024;
    private static final byte[] PDF_MAGIC = "%PDF-".getBytes(StandardCharsets.US_ASCII);

    private final ResumeRepository resumes;
    private final AiServiceClient ai;
    private final AppProperties.Limits limits;
    private final TransactionTemplate tx;

    public ResumeService(ResumeRepository resumes, AiServiceClient ai, AppProperties props,
                         PlatformTransactionManager txManager) {
        this.resumes = resumes;
        this.ai = ai;
        this.limits = props.limits();
        this.tx = new TransactionTemplate(txManager);
    }

    @Transactional(readOnly = true)
    public List<ResumeSummary> list(UUID userId) {
        return resumes.findSummaries(userId);
    }

    @Transactional(readOnly = true)
    public Resume getOwned(UUID userId, UUID resumeId) {
        return resumes.findByIdAndUserId(resumeId, userId).orElseThrow(() -> ApiException.notFound("Resume"));
    }

    public ResumeDetail detail(UUID userId, UUID resumeId) {
        Resume r = getOwned(userId, resumeId);
        return ResumeDetail.from(r, structureOrNull(r.getContentText()), List.of());
    }

    /**
     * Validates the upload, sends the bytes to the NLP service for extraction and stores only the
     * extracted text. The PDF itself is held in memory for the duration of the request and discarded.
     */
    public ResumeDetail upload(UUID userId, MultipartFile file, String title) {
        byte[] bytes = validatePdf(file);
        enforceQuota(userId);
        String filename = safeFilename(file.getOriginalFilename());
        AiDtos.ResumeExtractResponse extracted = ai.extractPdf(bytes, filename);
        Resume saved = persist(new Resume(userId, resolveTitle(title, filename), ResumeSource.PDF, filename,
                extracted.pageCount(), extracted.text()));
        log.info("resume_uploaded resumeId={} pages={} chars={}", saved.getId(), extracted.pageCount(), extracted.charCount());
        return ResumeDetail.from(saved, extracted.structure(), extracted.warnings());
    }

    public ResumeDetail createFromText(UUID userId, SaveResumeRequest req) {
        enforceQuota(userId);
        String text = cleanText(req.content());
        AiDtos.ResumeStructure structure = ai.parseResume(text);
        Resume saved = persist(new Resume(userId, req.title().trim(), ResumeSource.TEXT, null, null, text));
        log.info("resume_created resumeId={} chars={}", saved.getId(), saved.getCharCount());
        return ResumeDetail.from(saved, structure, List.of());
    }

    public ResumeDetail update(UUID userId, UUID resumeId, SaveResumeRequest req) {
        getOwned(userId, resumeId);
        String text = cleanText(req.content());
        AiDtos.ResumeStructure structure = ai.parseResume(text);
        Resume updated = applyUpdate(userId, resumeId, req.title().trim(), text);
        log.info("resume_updated resumeId={} chars={}", resumeId, updated.getCharCount());
        return ResumeDetail.from(updated, structure, List.of());
    }

    @Transactional
    public void delete(UUID userId, UUID resumeId) {
        Resume r = getOwned(userId, resumeId);
        resumes.delete(r);
        log.info("resume_deleted resumeId={}", resumeId);
    }

    /** Short write transaction; the NLP call happens before it so no DB connection is held during inference. */
    private Resume persist(Resume resume) {
        return tx.execute(status -> resumes.save(resume));
    }

    private Resume applyUpdate(UUID userId, UUID resumeId, String title, String text) {
        return tx.execute(status -> {
            Resume r = resumes.findByIdAndUserId(resumeId, userId).orElseThrow(() -> ApiException.notFound("Resume"));
            r.setTitle(title);
            r.setContentText(text);
            return resumes.saveAndFlush(r);
        });
    }

    private AiDtos.ResumeStructure structureOrNull(String text) {
        try {
            return ai.parseResume(text);
        } catch (ApiException e) {
            // The resume text is still returned; structure is an optional enrichment.
            log.info("resume_structure_unavailable code={}", e.getCode());
            return null;
        }
    }

    private void enforceQuota(UUID userId) {
        if (resumes.countByUserId(userId) >= limits.maxResumesPerUser()) {
            throw ApiException.conflict("RESUME_LIMIT_REACHED",
                    "You can store up to " + limits.maxResumesPerUser() + " resumes. Delete one to add another.");
        }
    }

    private String cleanText(String content) {
        String text = content.replace("\u0000", "").strip();
        if (text.length() > limits.maxResumeChars()) {
            throw ApiException.badRequest("RESUME_TOO_LONG", "Resume text must be at most "
                    + limits.maxResumeChars() + " characters.");
        }
        return text;
    }

    static byte[] validatePdf(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("EMPTY_FILE", "Please choose a PDF file to upload.");
        }
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase(Locale.ROOT);
        if (!name.endsWith(".pdf")) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_FILE_TYPE",
                    "Only PDF files are supported. You can paste your resume text instead.");
        }
        String contentType = file.getContentType();
        if (contentType != null && !contentType.equals("application/pdf") && !contentType.equals("application/octet-stream")
                && !contentType.equals("application/x-pdf")) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_FILE_TYPE",
                    "The file does not look like a PDF.");
        }
        if (file.getSize() > MAX_PDF_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", "The file exceeds the 5 MB upload limit.");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("INVALID_UPLOAD", "The upload could not be read.");
        }
        if (bytes.length < PDF_MAGIC.length || !Arrays.equals(Arrays.copyOf(bytes, PDF_MAGIC.length), PDF_MAGIC)) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "NOT_A_PDF",
                    "The file content is not a valid PDF, even though it has a .pdf extension.");
        }
        return bytes;
    }

    /** Strips any client-supplied path segments and unsafe characters; the name is metadata only. */
    static String safeFilename(String original) {
        if (original == null || original.isBlank()) {
            return "resume.pdf";
        }
        String base = original.replace('\\', '/');
        base = base.substring(base.lastIndexOf('/') + 1);
        base = base.replaceAll("[^A-Za-z0-9._ -]", "_").strip();
        if (base.isEmpty() || base.equals(".pdf")) {
            return "resume.pdf";
        }
        return base.length() > 120 ? base.substring(base.length() - 120) : base;
    }

    private static String resolveTitle(String title, String filename) {
        if (title != null && !title.isBlank()) {
            String t = title.strip();
            return t.length() > 120 ? t.substring(0, 120) : t;
        }
        String base = filename.replaceAll("(?i)\\.pdf$", "");
        return base.isBlank() ? "My resume" : base;
    }
}
