package com.careerlens.comparison;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AnalysisResultRepository extends JpaRepository<AnalysisResultEntity, UUID> {}
