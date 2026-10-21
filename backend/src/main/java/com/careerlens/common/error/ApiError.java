package com.careerlens.common.error;

import java.time.Instant;
import java.util.List;

/** Consistent error body returned by every endpoint. */
public record ApiError(
        int status,
        String code,
        String message,
        List<FieldViolation> fieldErrors,
        String path,
        String requestId,
        Instant timestamp) {

    public record FieldViolation(String field, String message) {}
}
