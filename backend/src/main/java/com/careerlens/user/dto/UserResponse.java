package com.careerlens.user.dto;

import com.careerlens.user.User;
import java.time.Instant;
import java.util.UUID;

public record UserResponse(UUID id, String email, String fullName, String headline, Instant createdAt) {

    public static UserResponse from(User u) {
        return new UserResponse(u.getId(), u.getEmail(), u.getFullName(), u.getHeadline(), u.getCreatedAt());
    }
}
