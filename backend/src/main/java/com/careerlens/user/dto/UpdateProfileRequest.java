package com.careerlens.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @NotBlank(message = "Name is required") @Size(max = 100, message = "Name must be at most 100 characters")
        String fullName,
        @Size(max = 150, message = "Headline must be at most 150 characters") String headline) {}
