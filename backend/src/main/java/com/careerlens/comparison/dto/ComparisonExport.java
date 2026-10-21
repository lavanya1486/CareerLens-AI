package com.careerlens.comparison.dto;

import java.time.Instant;

/** Programmatic JSON export of one saved comparison. */
public record ComparisonExport(String exportFormat, Instant exportedAt, ComparisonDetail comparison) {}
