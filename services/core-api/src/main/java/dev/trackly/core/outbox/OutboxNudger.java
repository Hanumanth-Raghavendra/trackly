package dev.trackly.core.outbox;

import dev.trackly.core.config.AppProperties;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.client.RestClient;

/**
 * After a transaction that wrote outbox events commits, pings the insights service so it pulls
 * the new events immediately instead of waiting for its next poll.
 *
 * <p>The nudge is only an optimisation: if it fails (insights asleep on the free tier, network
 * blip), insights still finds the events on its next poll. Concurrent nudges are coalesced.
 */
@Component
public class OutboxNudger {

    private static final Logger log = LoggerFactory.getLogger(OutboxNudger.class);

    private final RestClient client;
    private final String nudgeUrl;
    private final String serviceToken;
    private final AtomicBoolean inFlight = new AtomicBoolean(false);
    private final AtomicBoolean dirty = new AtomicBoolean(false);

    public OutboxNudger(AppProperties props) {
        String base = props.insights().url();
        this.nudgeUrl = base == null || base.isBlank() ? null : base.replaceAll("/+$", "") + "/internal/outbox/nudge";
        this.serviceToken = props.insights().serviceToken();
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(5));
        this.client = RestClient.builder().requestFactory(factory).build();
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onOutboxWritten(OutboxPublisher.OutboxWritten ignored) {
        if (nudgeUrl == null) {
            return;
        }
        if (!inFlight.compareAndSet(false, true)) {
            dirty.set(true);
            return;
        }
        try {
            do {
                dirty.set(false);
                send();
            } while (dirty.get());
        } finally {
            inFlight.set(false);
        }
    }

    private void send() {
        try {
            client.post().uri(nudgeUrl).header("X-Service-Token", serviceToken).retrieve().toBodilessEntity();
        } catch (Exception e) {
            log.debug("Insights nudge failed (it will catch up by polling): {}", e.getMessage());
        }
    }
}
