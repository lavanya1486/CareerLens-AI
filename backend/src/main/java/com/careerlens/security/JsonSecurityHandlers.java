package com.careerlens.security;

import com.careerlens.common.error.GlobalExceptionHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.stereotype.Component;

/** Writes 401/403 responses in the shared ApiError JSON format. */
@Component
public class JsonSecurityHandlers {

    private final ObjectMapper mapper;

    public JsonSecurityHandlers(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public AuthenticationEntryPoint entryPoint() {
        return (request, response, ex) -> write(request, response, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED",
                "Please sign in to continue.");
    }

    public AccessDeniedHandler accessDenied() {
        return (request, response, ex) -> {
            if (ex instanceof CsrfException) {
                write(request, response, HttpStatus.FORBIDDEN, "CSRF_INVALID",
                        "Your session security token is missing or expired. Refresh the page and try again.");
            } else {
                write(request, response, HttpStatus.FORBIDDEN, "FORBIDDEN", "You do not have permission to do this.");
            }
        };
    }

    private void write(HttpServletRequest request, HttpServletResponse response, HttpStatus status, String code,
                       String message) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(),
                GlobalExceptionHandler.body(status, code, message, List.of(), request));
    }
}
