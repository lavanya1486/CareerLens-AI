package com.careerlens.resume;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ResumeRepository extends JpaRepository<Resume, UUID> {

    /** Ownership-scoped lookup: another user's id simply returns empty (-> 404). */
    Optional<Resume> findByIdAndUserId(UUID id, UUID userId);

    long countByUserId(UUID userId);

    /** Lightweight projection so listing resumes never loads full resume text. */
    @Query("""
            select new com.careerlens.resume.dto.ResumeSummary(r.id, r.title, r.sourceType, r.originalFilename,
                   r.pageCount, r.charCount, r.createdAt, r.updatedAt)
            from Resume r where r.userId = :userId order by r.updatedAt desc""")
    List<com.careerlens.resume.dto.ResumeSummary> findSummaries(@Param("userId") UUID userId);
}
