package com.careerlens.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
        @NotBlank(message = "Current password is required") @Size(max = 72) String currentPassword,
        @NotBlank(message = "New password is required")
        @Size(min = 10, max = 72, message = "Password must be 10-72 characters")
        @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "Password must contain at least one letter and one number")
        String newPassword) {}
