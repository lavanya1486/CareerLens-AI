package com.careerlens.comparison;

import com.careerlens.comparison.dto.BandCount;
import com.careerlens.comparison.dto.ScoreStats;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ComparisonRepository extends JpaRepository<Comparison, UUID>, JpaSpecificationExecutor<Comparison> {

    /** Ownership-scoped lookup used by every read/update/delete/report endpoint. */
    Optional<Comparison> findByIdAndUserId(UUID id, UUID userId);

    @Query("""
            select new com.careerlens.comparison.dto.ScoreStats(count(c), avg(c.overallScore), max(c.overallScore))
            from Comparison c where c.userId = :userId and c.saved = true""")
    ScoreStats savedStats(@Param("userId") UUID userId);

    List<Comparison> findByUserIdAndSavedTrueOrderByOverallScoreDescCreatedAtDesc(UUID userId, Pageable pageable);

    List<Comparison> findByUserIdAndSavedTrueOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    List<Comparison> findByUserIdAndSavedTrueAndScoringVersionOrderByCreatedAtDesc(UUID userId, String scoringVersion,
                                                                                    Pageable pageable);

    long countByUserIdAndSavedTrueAndScoringVersionNot(UUID userId, String scoringVersion);

    @Query("""
            select new com.careerlens.comparison.dto.BandCount(c.scoreBand, count(c))
            from Comparison c where c.userId = :userId and c.saved = true group by c.scoreBand""")
    List<BandCount> bandCounts(@Param("userId") UUID userId);

    /** Retention policy: unsaved drafts are deleted after the configured window (DB cascades remove children). */
    @Modifying
    @Query("delete from Comparison c where c.saved = false and c.createdAt < :cutoff")
    int deleteDraftsOlderThan(@Param("cutoff") Instant cutoff);
}
