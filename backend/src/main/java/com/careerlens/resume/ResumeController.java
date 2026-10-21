package com.careerlens.resume;

import com.careerlens.common.ratelimit.RateLimiter;
import com.careerlens.resume.dto.ResumeDetail;
import com.careerlens.resume.dto.ResumeSummary;
import com.careerlens.resume.dto.SaveResumeRequest;
import com.careerlens.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/resumes")
@Tag(name = "Resumes")
@Validated
public class ResumeController {

    private final ResumeService resumeService;
    private final RateLimiter rateLimiter;

    public ResumeController(ResumeService resumeService, RateLimiter rateLimiter) {
        this.resumeService = resumeService;
        this.rateLimiter = rateLimiter;
    }

    @Operation(summary = "List the signed-in user's resumes")
    @GetMapping
    public List<ResumeSummary> list() {
        return resumeService.list(CurrentUser.id());
    }

    @Operation(summary = "Upload a PDF resume; only the extracted text is stored")
    @PostMapping(path = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ResumeDetail> upload(@RequestPart("file") MultipartFile file,
                                               @RequestParam(value = "title", required = false) @Size(max = 120) String title) {
        UUID userId = CurrentUser.id();
        rateLimiter.acquire(RateLimiter.Bucket.UPLOAD, userId.toString());
        return ResponseEntity.status(HttpStatus.CREATED).body(resumeService.upload(userId, file, title));
    }

    @Operation(summary = "Create a resume from pasted text")
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ResumeDetail> create(@Valid @RequestBody SaveResumeRequest body) {
        UUID userId = CurrentUser.id();
        rateLimiter.acquire(RateLimiter.Bucket.EXTRACT, userId.toString());
        return ResponseEntity.status(HttpStatus.CREATED).body(resumeService.createFromText(userId, body));
    }

    @Operation(summary = "Get a resume with its text and detected structure")
    @GetMapping("/{id}")
    public ResumeDetail get(@PathVariable UUID id) {
        return resumeService.detail(CurrentUser.id(), id);
    }

    @Operation(summary = "Replace a resume's title and text after review")
    @PutMapping("/{id}")
    public ResumeDetail update(@PathVariable UUID id, @Valid @RequestBody SaveResumeRequest body) {
        UUID userId = CurrentUser.id();
        rateLimiter.acquire(RateLimiter.Bucket.EXTRACT, userId.toString());
        return resumeService.update(userId, id, body);
    }

    @Operation(summary = "Delete a resume (saved comparisons keep their own results)")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        resumeService.delete(CurrentUser.id(), id);
        return ResponseEntity.noContent().build();
    }
}
