package dev.trackly.core;

import dev.trackly.core.config.AppProperties;
import dev.trackly.core.config.DatabaseUrl;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Trackly core API — the system of record.
 *
 * <p>Owns users, auth, tasks, projects, habits, goals and focus sessions. Every state change
 * also writes a domain event to the transactional outbox, which the insights service consumes.
 */
@SpringBootApplication
@EnableScheduling
@EnableAsync
@EnableConfigurationProperties(AppProperties.class)
public class CoreApiApplication {

    public static void main(String[] args) {
        // Accept a Neon-style postgres:// DATABASE_URL so both services share one connection string.
        DatabaseUrl.applyFromEnvironment(System.getenv());
        SpringApplication.run(CoreApiApplication.class, args);
    }
}
