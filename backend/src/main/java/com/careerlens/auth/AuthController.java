package com.careerlens.auth;

import com.careerlens.auth.dto.LoginRequest;
import com.careerlens.auth.dto.RegisterRequest;
import com.careerlens.common.ratelimit.RateLimiter;
import com.careerlens.security.AuthCookieService;
import com.careerlens.user.dto.UserResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Authentication")
public class AuthController {

    private final AuthService authService;
    private final AuthCookieService cookies;
    private final RateLimiter rateLimiter;

    public AuthController(AuthService authService, AuthCookieService cookies, RateLimiter rateLimiter) {
        this.authService = authService;
        this.cookies = cookies;
        this.rateLimiter = rateLimiter;
    }

    @Operation(summary = "Issue the XSRF-TOKEN cookie required for state-changing requests")
    @GetMapping("/csrf")
    public ResponseEntity<Void> csrf() {
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Create an account and start a session")
    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(@Valid @RequestBody RegisterRequest body, HttpServletRequest request,
                                                 HttpServletResponse response) {
        rateLimiter.acquire(RateLimiter.Bucket.AUTH, request.getRemoteAddr());
        AuthService.AuthResult result = authService.register(body);
        cookies.write(response, result.token());
        return ResponseEntity.status(HttpStatus.CREATED).body(UserResponse.from(result.user()));
    }

    @Operation(summary = "Sign in and start a session")
    @PostMapping("/login")
    public UserResponse login(@Valid @RequestBody LoginRequest body, HttpServletRequest request,
                              HttpServletResponse response) {
        rateLimiter.acquire(RateLimiter.Bucket.AUTH, request.getRemoteAddr());
        AuthService.AuthResult result = authService.login(body);
        cookies.write(response, result.token());
        return UserResponse.from(result.user());
    }

    @Operation(summary = "End the current session")
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletResponse response) {
        cookies.clear(response);
        return ResponseEntity.noContent().build();
    }
}
