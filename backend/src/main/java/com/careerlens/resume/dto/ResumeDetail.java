package com.careerlens.resume.dto;

import com.careerlens.ai.AiDtos;
import com.careerlens.resume.Resume;
import com.careerlens.resume.ResumeSource;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Full resume including text, detected structure and any extraction warnings. */
public record ResumeDetail(UUID id, String title, ResumeSource sourceType, String originalFilename, Integer pageCount,
                           int charCount, String content, AiDtos.ResumeStructure structure, List<String> warnings,
                           Instant createdAt, Instant updatedAt) {

    public static ResumeDetail from(Resume r, AiDtos.ResumeStructure structure, List<String> warnings) {
        return new ResumeDetail(r.getId(), r.getTitle(), r.getSourceType(), r.getOriginalFilename(), r.getPageCount(),
                r.getCharCount(), r.getContentText(), structure, warnings, r.getCreatedAt(), r.getUpdatedAt());
    }
}
