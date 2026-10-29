package dev.trackly.core.outbox;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/**
 * Writes domain events to {@code core.outbox_events} — the transactional outbox.
 *
 * <p>{@code Propagation.MANDATORY} makes it impossible to publish outside a business transaction:
 * the event row commits or rolls back together with the change it describes, so the insights
 * service never sees an event for a change that didn't happen (and never misses one that did).
 */
@Component
public class OutboxPublisher {

    private static final String INSERT = """
            INSERT INTO core.outbox_events (user_id, aggregate_type, aggregate_id, event_type, payload, occurred_at)
            VALUES (?, ?, ?, ?, ?::jsonb, ?)
            """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final ApplicationEventPublisher appEvents;

    public OutboxPublisher(JdbcTemplate jdbc, ObjectMapper mapper, ApplicationEventPublisher appEvents) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.appEvents = appEvents;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void publish(UUID userId, String aggregateType, UUID aggregateId, String eventType,
                        Map<String, Object> payload, Instant occurredAt) {
        jdbc.update(INSERT, userId, aggregateType, aggregateId, eventType,
                mapper.writeValueAsString(payload), Timestamp.from(occurredAt));
        // Tells OutboxNudger to ping the insights service once this transaction commits.
        appEvents.publishEvent(OutboxWritten.INSTANCE);
    }

    /** One event for {@link #publishAll}. */
    public record Event(UUID userId, String aggregateType, UUID aggregateId, String eventType,
                        Map<String, Object> payload, Instant occurredAt) {}

    /** Batch variant used by the demo seeder (hundreds of historical events in one round trip). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void publishAll(java.util.List<Event> events) {
        if (events.isEmpty()) {
            return;
        }
        jdbc.batchUpdate(INSERT, events, 200, (ps, e) -> {
            ps.setObject(1, e.userId());
            ps.setString(2, e.aggregateType());
            ps.setObject(3, e.aggregateId());
            ps.setString(4, e.eventType());
            ps.setString(5, mapper.writeValueAsString(e.payload()));
            ps.setTimestamp(6, Timestamp.from(e.occurredAt()));
        });
        appEvents.publishEvent(OutboxWritten.INSTANCE);
    }

    /** Marker event; the nudger coalesces many of these into a single HTTP call. */
    public enum OutboxWritten { INSTANCE }
}
