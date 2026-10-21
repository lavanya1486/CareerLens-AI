package com.careerlens.comparison;

import com.careerlens.comparison.dto.ComparisonFilter;
import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.data.jpa.domain.Specification;

/** Type-safe, parameterised filters (no string-concatenated SQL) for the history page. */
final class ComparisonSpecifications {

    private ComparisonSpecifications() {
    }

    static Specification<Comparison> savedFor(UUID userId, ComparisonFilter f) {
        return (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("userId"), userId));
            p.add(cb.isTrue(root.get("saved")));
            if (f.q() != null && !f.q().isBlank()) {
                String like = "%" + escapeLike(f.q().trim().toLowerCase(Locale.ROOT)) + "%";
                p.add(cb.or(
                        cb.like(cb.lower(root.get("name")), like, '\\'),
                        cb.like(cb.lower(cb.coalesce(root.get("jobTitle"), "")), like, '\\'),
                        cb.like(cb.lower(cb.coalesce(root.get("company"), "")), like, '\\')));
            }
            if (f.jobTitle() != null && !f.jobTitle().isBlank()) {
                String like = "%" + escapeLike(f.jobTitle().trim().toLowerCase(Locale.ROOT)) + "%";
                p.add(cb.like(cb.lower(cb.coalesce(root.get("jobTitle"), "")), like, '\\'));
            }
            if (f.minScore() != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("overallScore"), BigDecimal.valueOf(f.minScore())));
            }
            if (f.maxScore() != null) {
                p.add(cb.lessThanOrEqualTo(root.get("overallScore"), BigDecimal.valueOf(f.maxScore())));
            }
            if (f.from() != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("createdAt"), f.from().atStartOfDay().toInstant(ZoneOffset.UTC)));
            }
            if (f.to() != null) {
                p.add(cb.lessThan(root.get("createdAt"), f.to().plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
    }

    static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
