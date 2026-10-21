package com.careerlens.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank(message = "Email is required") @Size(max = 254) String email,
        @NotBlank(message = "Password is required") @Size(max = 72) String password) {}
