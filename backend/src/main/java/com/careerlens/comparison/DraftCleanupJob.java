package com.careerlens.comparison;

import com.careerlens.config.AppProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Enforces the retention policy for analyses the user never saved. */
@Component
public class DraftCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(DraftCleanupJob.class);

    private final ComparisonRepository comparisons;
    private final Duration retention;
    private final Clock clock;

    public DraftCleanupJob(ComparisonRepository comparisons, AppProperties props, Clock clock) {
        this.comparisons = comparisons;
        this.retention = Duration.ofHours(props.retention().draftHours());
        this.clock = clock;
    }

    @Scheduled(cron = "${app.retention.cleanup-cron}")
    @Transactional
    public int purgeExpiredDrafts() {
        Instant cutoff = clock.instant().minus(retention);
        int deleted = comparisons.deleteDraftsOlderThan(cutoff);
        if (deleted > 0) {
            log.info("draft_cleanup deleted={}", deleted);
        }
        return deleted;
    }
}
