package dev.trackly.core.user;

import java.util.LinkedHashMap;
import java.util.Map;

/** Builds the outbox payload for user events (see docs/EVENTS.md). */
public final class UserEvents {

    private UserEvents() {}

    public static Map<String, Object> snapshot(User u) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("id", u.getId().toString());
        p.put("email", u.getEmail());
        p.put("displayName", u.getDisplayName());
        p.put("timezone", u.getTimezone());
        p.put("focusGoalMinutes", u.getFocusGoalMinutes());
        p.put("demo", u.isDemo());
        p.put("createdAt", u.getCreatedAt() == null ? null : u.getCreatedAt().toString());
        return p;
    }
}
