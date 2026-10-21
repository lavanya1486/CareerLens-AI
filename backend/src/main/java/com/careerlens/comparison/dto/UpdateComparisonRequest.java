package com.careerlens.comparison.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Size;

/** Partial update; null fields are left unchanged. {@code saved} can only transition to true. */
public record UpdateComparisonRequest(
        @Size(min = 1, max = 150, message = "Name must be 1-150 characters") String name,
        @Size(max = 150, message = "Job title must be at most 150 characters") String jobTitle,
        @Size(max = 150, message = "Company must be at most 150 characters") String company,
        Boolean saved) {

    @AssertTrue(message = "saved can only be set to true; delete a comparison to remove it")
    public boolean isSavedTransitionValid() {
        return saved == null || saved;
    }
}
