package com.careerlens.user;

import com.careerlens.common.error.ApiException;
import com.careerlens.security.JwtService;
import com.careerlens.user.dto.ChangePasswordRequest;
import com.careerlens.user.dto.UpdateProfileRequest;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;

    public UserService(UserRepository users, PasswordEncoder encoder, JwtService jwt) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
    }

    @Transactional(readOnly = true)
    public User get(UUID userId) {
        return users.findById(userId).orElseThrow(() -> ApiException.notFound("Account"));
    }

    @Transactional
    public User updateProfile(UUID userId, UpdateProfileRequest req) {
        User user = get(userId);
        user.setFullName(req.fullName().trim());
        user.setHeadline(req.headline() == null || req.headline().isBlank() ? null : req.headline().trim());
        return user;
    }

    /** Changes the password, revokes all existing tokens and returns a fresh token for this session. */
    @Transactional
    public String changePassword(UUID userId, ChangePasswordRequest req) {
        User user = get(userId);
        requirePassword(user, req.currentPassword());
        if (encoder.matches(req.newPassword(), user.getPasswordHash())) {
            throw ApiException.badRequest("PASSWORD_UNCHANGED", "The new password must be different from the current one.");
        }
        user.setPasswordHash(encoder.encode(req.newPassword()));
        user.revokeTokens();
        log.info("password_changed userId={}", userId);
        return jwt.issue(user.getId(), user.getTokenVersion());
    }

    @Transactional
    public void revokeAllSessions(UUID userId) {
        get(userId).revokeTokens();
        log.info("sessions_revoked userId={}", userId);
    }

    /** Permanently deletes the account; database cascades remove resumes, comparisons and results. */
    @Transactional
    public void deleteAccount(UUID userId, String password) {
        User user = get(userId);
        requirePassword(user, password);
        users.hardDelete(userId);
        log.info("account_deleted userId={}", userId);
    }

    private void requirePassword(User user, String password) {
        if (!encoder.matches(password, user.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_PASSWORD", "The password is incorrect.");
        }
    }
}
