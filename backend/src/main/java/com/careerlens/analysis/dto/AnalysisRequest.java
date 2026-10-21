package com.careerlens.analysis.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record AnalysisRequest(
        @NotNull(message = "Choose a resume to analyse") UUID resumeId,
        @NotBlank(message = "Paste a job description")
        @Size(min = 100, max = 20000, message = "Job description must be between 100 and 20,000 characters")
        String jobDescription,
        @Size(max = 150, message = "Job title must be at most 150 characters") String jobTitle,
        @Size(max = 150, message = "Company must be at most 150 characters") String company,
        @Size(max = 80, message = "At most 80 requirements") List<@Valid Requirement> requirements) {

    public record Requirement(
            @NotBlank(message = "Skill name is required") @Size(max = 80) String skill,
            @NotBlank @Pattern(regexp = "required|preferred", message = "importance must be 'required' or 'preferred'")
            String importance,
            @Size(max = 5) List<@NotBlank @Size(max = 80) String> alternatives) {}
}
