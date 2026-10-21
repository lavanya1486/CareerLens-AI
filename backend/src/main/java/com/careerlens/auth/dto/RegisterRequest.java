package com.careerlens.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank(message = "Email is required") @Email(message = "Enter a valid email address")
        @Size(max = 254, message = "Email is too long") String email,
        @NotBlank(message = "Password is required")
        @Size(min = 10, max = 72, message = "Password must be 10-72 characters")
        @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "Password must contain at least one letter and one number")
        String password,
        @NotBlank(message = "Name is required") @Size(max = 100, message = "Name must be at most 100 characters")
        String fullName) {}
