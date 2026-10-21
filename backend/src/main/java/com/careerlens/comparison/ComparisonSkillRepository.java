package com.careerlens.comparison;

import com.careerlens.comparison.dto.SkillCount;
import com.careerlens.comparison.dto.SkillDemand;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ComparisonSkillRepository extends JpaRepository<ComparisonSkill, Long> {

    List<ComparisonSkill> findByComparisonId(UUID comparisonId);

    @Query("""
            select new com.careerlens.comparison.dto.SkillCount(s.skillName, s.category, count(s))
            from ComparisonSkill s, Comparison c
            where s.comparisonId = c.id and c.userId = :userId and c.saved = true
              and s.status = com.careerlens.comparison.ComparisonSkill.Status.MISSING
              and s.importance = com.careerlens.comparison.ComparisonSkill.Importance.REQUIRED
            group by s.skillName, s.category
            order by count(s) desc, s.skillName asc""")
    List<SkillCount> frequentlyMissingRequired(@Param("userId") UUID userId, Pageable pageable);

    @Query("""
            select new com.careerlens.comparison.dto.SkillDemand(s.skillName, s.category, count(s),
                   sum(case when s.status = com.careerlens.comparison.ComparisonSkill.Status.MATCHED then 1 else 0 end))
            from ComparisonSkill s, Comparison c
            where s.comparisonId = c.id and c.userId = :userId and c.saved = true
            group by s.skillName, s.category
            order by count(s) desc, s.skillName asc""")
    List<SkillDemand> mostRequested(@Param("userId") UUID userId, Pageable pageable);
}
