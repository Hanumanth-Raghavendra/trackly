package dev.trackly.core.outbox;

import dev.trackly.core.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Keeps the outbox small: events older than the retention window have long been consumed. */
@Component
public class OutboxCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(OutboxCleanupJob.class);

    private final JdbcTemplate jdbc;
    private final int retentionDays;

    public OutboxCleanupJob(JdbcTemplate jdbc, AppProperties props) {
        this.jdbc = jdbc;
        this.retentionDays = Math.max(1, props.outbox().retentionDays());
    }

    @Scheduled(initialDelayString = "PT10M", fixedDelayString = "PT6H")
    public void purgeOldEvents() {
        int deleted = jdbc.update(
                "DELETE FROM core.outbox_events WHERE created_at < now() - make_interval(days => ?)", retentionDays);
        if (deleted > 0) {
            log.info("Purged {} outbox events older than {} days", deleted, retentionDays);
        }
    }
}
