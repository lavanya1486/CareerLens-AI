package com.careerlens.resume.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SaveResumeRequest(
        @NotBlank(message = "Title is required") @Size(max = 120, message = "Title must be at most 120 characters")
        String title,
        @NotBlank(message = "Resume text is required")
        @Size(min = 150, max = 40000, message = "Resume text must be between 150 and 40,000 characters")
        String content) {}
