package dev.trackly.core.demo;

import dev.trackly.core.config.AppProperties;
import dev.trackly.core.outbox.EventTypes;
import dev.trackly.core.outbox.OutboxPublisher;
import dev.trackly.core.user.UserRepository;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Deletes demo accounts after their TTL (24h by default) so the free database stays small. */
@Component
public class DemoCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(DemoCleanupJob.class);

    private final UserRepository users;
    private final OutboxPublisher outbox;
    private final AppProperties props;
    private final Clock clock;

    public DemoCleanupJob(UserRepository users, OutboxPublisher outbox, AppProperties props, Clock clock) {
        this.users = users;
        this.outbox = outbox;
        this.props = props;
        this.clock = clock;
    }

    @Scheduled(initialDelayString = "PT2M", fixedDelayString = "PT30M")
    @Transactional
    public void deleteExpiredDemos() {
        List<UUID> expired = users.findExpiredDemoUserIds(clock.instant().minus(props.demo().ttl()));
        for (UUID id : expired) {
            outbox.publish(id, EventTypes.USER, id, EventTypes.USER_DELETED, Map.of("id", id.toString()),
                    clock.instant());
            users.deleteById(id);
        }
        if (!expired.isEmpty()) {
            log.info("Deleted {} expired demo accounts", expired.size());
        }
    }
}
