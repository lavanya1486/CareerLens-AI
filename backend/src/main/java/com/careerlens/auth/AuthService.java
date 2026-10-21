package com.careerlens.auth;

import com.careerlens.auth.dto.LoginRequest;
import com.careerlens.auth.dto.RegisterRequest;
import com.careerlens.common.error.ApiException;
import com.careerlens.security.JwtService;
import com.careerlens.user.User;
import com.careerlens.user.UserRepository;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    /** Pre-computed hash used to equalise timing when the email does not exist. */
    private final String dummyHash;

    public record AuthResult(User user, String token) {}

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;

    public AuthService(UserRepository users, PasswordEncoder encoder, JwtService jwt) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
        this.dummyHash = encoder.encode("timing-equaliser-not-a-password-1");
    }

    public static String normaliseEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    @Transactional
    public AuthResult register(RegisterRequest req) {
        String email = normaliseEmail(req.email());
        if (users.existsByEmail(email)) {
            throw ApiException.conflict("EMAIL_IN_USE", "An account with this email already exists.");
        }
        User user = users.save(new User(email, encoder.encode(req.password()), req.fullName().trim()));
        log.info("user_registered userId={}", user.getId());
        return new AuthResult(user, jwt.issue(user.getId(), user.getTokenVersion()));
    }

    @Transactional(readOnly = true)
    public AuthResult login(LoginRequest req) {
        String email = normaliseEmail(req.email());
        User user = users.findByEmail(email).orElse(null);
        String hash = user != null ? user.getPasswordHash() : dummyHash;
        boolean ok = encoder.matches(req.password(), hash);
        if (user == null || !ok) {
            log.info("login_failed");
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Email or password is incorrect.");
        }
        log.info("login_succeeded userId={}", user.getId());
        return new AuthResult(user, jwt.issue(user.getId(), user.getTokenVersion()));
    }
}
