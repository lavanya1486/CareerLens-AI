package com.careerlens.comparison;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** The complete explainable analysis document (JSONB), stored 1:1 with a comparison. */
@Entity
@Table(name = "analysis_results")
public class AnalysisResultEntity {

    @Id
    @Column(name = "comparison_id")
    private UUID comparisonId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "result_json", nullable = false, columnDefinition = "jsonb")
    private String resultJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected AnalysisResultEntity() {
    }

    public AnalysisResultEntity(UUID comparisonId, String resultJson) {
        this.comparisonId = comparisonId;
        this.resultJson = resultJson;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public UUID getComparisonId() { return comparisonId; }
    public String getResultJson() { return resultJson; }
}
