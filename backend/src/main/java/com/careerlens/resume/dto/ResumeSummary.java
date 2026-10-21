package com.careerlens.resume.dto;

import com.careerlens.resume.ResumeSource;
import java.time.Instant;
import java.util.UUID;

public record ResumeSummary(UUID id, String title, ResumeSource sourceType, String originalFilename, Integer pageCount,
                            int charCount, Instant createdAt, Instant updatedAt) {}
