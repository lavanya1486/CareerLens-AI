package com.careerlens.security;

import com.careerlens.user.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import org.slf4j.MDC;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authenticates requests from the session cookie. The token version is checked against the
 * database on every request, so password changes and "sign out everywhere" revoke old tokens.
 * Tokens past half of their lifetime are transparently renewed (sliding session).
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final AuthCookieService cookies;
    private final UserRepository users;
    private final Clock clock;

    public JwtAuthenticationFilter(JwtService jwtService, AuthCookieService cookies, UserRepository users, Clock clock) {
        this.jwtService = jwtService;
        this.cookies = cookies;
        this.users = users;
        this.clock = clock;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        cookies.read(request).flatMap(jwtService::verify).ifPresent(claims ->
                users.findById(claims.userId())
                        .filter(u -> u.getTokenVersion() == claims.tokenVersion())
                        .ifPresent(user -> {
                            AuthenticatedUser principal = new AuthenticatedUser(user.getId(), user.getEmail());
                            var auth = new UsernamePasswordAuthenticationToken(principal, null,
                                    List.of(new SimpleGrantedAuthority("ROLE_USER")));
                            SecurityContextHolder.getContext().setAuthentication(auth);
                            MDC.put("userId", user.getId().toString());
                            Duration remaining = Duration.between(clock.instant(), claims.expiresAt());
                            if (remaining.compareTo(jwtService.ttl().dividedBy(2)) < 0) {
                                cookies.write(response, jwtService.issue(user.getId(), user.getTokenVersion()));
                            }
                        }));
        chain.doFilter(request, response);
    }
}
