package com.careerlens.security;

import java.util.UUID;

/** Minimal principal stored in the security context - never the JPA entity. */
public record AuthenticatedUser(UUID id, String email) {}
