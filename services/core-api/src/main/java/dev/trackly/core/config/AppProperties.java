package dev.trackly.core.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Typed application settings, bound from the {@code trackly.*} namespace in application.yml
 * (which in turn reads environment variables, so the same jar runs locally and on Render).
 */
@ConfigurationProperties(prefix = "trackly")
public record AppProperties(Jwt jwt, Cors cors, Cookie cookie, Insights insights, Demo demo, Outbox outbox,
                            RateLimit rateLimit) {

    public record Jwt(String secret, String issuer, Duration accessTtl, Duration refreshTtl) {}

    public record Cors(List<String> allowedOrigins) {}

    public record Cookie(boolean secure, String sameSite) {}

    /** Where to send the "new events available" nudge, and the shared service token. */
    public record Insights(String url, String serviceToken) {}

    public record Demo(boolean enabled, Duration ttl) {}

    public record Outbox(int retentionDays) {}

    public record RateLimit(boolean enabled) {}
}
