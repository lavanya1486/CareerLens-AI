package com.careerlens.comparison;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

/** One requirement outcome of a comparison, normalised for analytics queries. */
@Entity
@Table(name = "comparison_skills")
public class ComparisonSkill {

    public enum Importance { REQUIRED, PREFERRED }

    public enum Status { MATCHED, PARTIAL, MISSING, REVIEW }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "comparison_id", nullable = false, updatable = false)
    private UUID comparisonId;

    @Column(name = "skill_name", nullable = false, length = 80)
    private String skillName;

    @Column(nullable = false, length = 30)
    private String category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Importance importance;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Status status;

    protected ComparisonSkill() {
    }

    public ComparisonSkill(UUID comparisonId, String skillName, String category, Importance importance, Status status) {
        this.comparisonId = comparisonId;
        this.skillName = skillName;
        this.category = category;
        this.importance = importance;
        this.status = status;
    }

    public Long getId() { return id; }
    public UUID getComparisonId() { return comparisonId; }
    public String getSkillName() { return skillName; }
    public String getCategory() { return category; }
    public Importance getImportance() { return importance; }
    public Status getStatus() { return status; }
}
