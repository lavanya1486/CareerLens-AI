package com.careerlens.comparison.dto;

import java.time.LocalDate;

public record ComparisonFilter(String q, String jobTitle, Double minScore, Double maxScore, LocalDate from,
                               LocalDate to) {}
