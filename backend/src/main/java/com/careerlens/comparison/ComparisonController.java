package com.careerlens.comparison;

import com.careerlens.common.ratelimit.RateLimiter;
import com.careerlens.common.web.PageResponse;
import com.careerlens.comparison.dto.ComparisonDetail;
import com.careerlens.comparison.dto.ComparisonExport;
import com.careerlens.comparison.dto.ComparisonFilter;
import com.careerlens.comparison.dto.ComparisonSummary;
import com.careerlens.comparison.dto.UpdateComparisonRequest;
import com.careerlens.report.PdfReportService;
import com.careerlens.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/comparisons")
@Tag(name = "Comparisons")
@Validated
public class ComparisonController {

    private final ComparisonService comparisonService;
    private final PdfReportService reportService;
    private final RateLimiter rateLimiter;
    private final Clock clock;

    public ComparisonController(ComparisonService comparisonService, PdfReportService reportService,
                                RateLimiter rateLimiter, Clock clock) {
        this.comparisonService = comparisonService;
        this.reportService = reportService;
        this.rateLimiter = rateLimiter;
        this.clock = clock;
    }

    @Operation(summary = "Search, filter, sort and paginate saved comparisons")
    @GetMapping
    public PageResponse<ComparisonSummary> search(
            @RequestParam(required = false) @Size(max = 100) String q,
            @RequestParam(required = false) @Size(max = 100) String jobTitle,
            @RequestParam(required = false) @DecimalMin("0") @DecimalMax("100") Double minScore,
            @RequestParam(required = false) @DecimalMin("0") @DecimalMax("100") Double maxScore,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "10") @Min(1) @Max(50) int size,
            @RequestParam(defaultValue = "createdAt,desc") @Size(max = 40) String sort) {
        ComparisonFilter filter = new ComparisonFilter(q, jobTitle, minScore, maxScore, from, to);
        return PageResponse.of(comparisonService.search(CurrentUser.id(), filter, page, size, sort));
    }

    @Operation(summary = "Get a comparison with its full explainable result")
    @GetMapping("/{id}")
    public ComparisonDetail get(@PathVariable UUID id) {
        return comparisonService.get(CurrentUser.id(), id);
    }

    @Operation(summary = "Rename, edit job details or save a draft comparison")
    @PatchMapping("/{id}")
    public ComparisonDetail update(@PathVariable UUID id, @Valid @RequestBody UpdateComparisonRequest body) {
        return comparisonService.update(CurrentUser.id(), id, body);
    }

    @Operation(summary = "Delete a comparison and its stored result")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        comparisonService.delete(CurrentUser.id(), id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Download a PDF report generated from the stored comparison")
    @GetMapping(value = "/{id}/report.pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> report(@PathVariable UUID id) {
        UUID userId = CurrentUser.id();
        rateLimiter.acquire(RateLimiter.Bucket.REPORT, userId.toString());
        ComparisonDetail detail = comparisonService.get(userId, id);
        byte[] pdf = reportService.render(detail);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, attachment(detail, "pdf"))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(pdf);
    }

    @Operation(summary = "Export a comparison as JSON")
    @GetMapping(value = "/{id}/export.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ComparisonExport> export(@PathVariable UUID id) {
        UUID userId = CurrentUser.id();
        rateLimiter.acquire(RateLimiter.Bucket.REPORT, userId.toString());
        ComparisonDetail detail = comparisonService.get(userId, id);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, attachment(detail, "json"))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(new ComparisonExport("careerlens.comparison.v1", Instant.now(clock), detail));
    }

    private static String attachment(ComparisonDetail d, String ext) {
        String slug = d.name().toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (slug.isBlank()) {
            slug = "comparison";
        }
        if (slug.length() > 60) {
            slug = slug.substring(0, 60);
        }
        return ContentDisposition.attachment().filename("careerlens-" + slug + "." + ext).build().toString();
    }
}
