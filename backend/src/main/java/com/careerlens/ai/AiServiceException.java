package com.careerlens.ai;

import com.careerlens.common.error.ApiException;
import org.springframework.http.HttpStatus;

/** Failure talking to (or reported by) the NLP service. Never carries fabricated results. */
public class AiServiceException extends ApiException {

    public AiServiceException(HttpStatus status, String code, String message) {
        super(status, code, message);
    }

    public AiServiceException(HttpStatus status, String code, String message, Throwable cause) {
        super(status, code, message, cause);
    }

    public static AiServiceException unavailable(Throwable cause) {
        return new AiServiceException(HttpStatus.SERVICE_UNAVAILABLE, "AI_SERVICE_UNAVAILABLE",
                "The analysis service is temporarily unavailable. Nothing was saved; please try again shortly.", cause);
    }

    public static AiServiceException timeout(Throwable cause) {
        return new AiServiceException(HttpStatus.GATEWAY_TIMEOUT, "AI_SERVICE_TIMEOUT",
                "The analysis took too long to complete. Please try again, or shorten the documents.", cause);
    }
}
