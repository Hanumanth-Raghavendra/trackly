package dev.trackly.core.security;

import java.time.ZoneId;
import java.util.UUID;

/**
 * The authenticated principal, rebuilt from access-token claims on every request
 * (no session, no database lookup).
 */
public record AuthUser(UUID id, String email, String displayName, String timezone) {

    public ZoneId zone() {
        try {
            return ZoneId.of(timezone);
        } catch (Exception e) {
            return ZoneId.of("UTC");
        }
    }
}
