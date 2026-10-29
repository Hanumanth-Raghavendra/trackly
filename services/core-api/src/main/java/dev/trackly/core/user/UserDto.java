package dev.trackly.core.user;

import java.time.Instant;
import java.util.UUID;

public record UserDto(
        UUID id,
        String email,
        String displayName,
        String timezone,
        int focusGoalMinutes,
        boolean demo,
        Instant createdAt) {

    public static UserDto from(User u) {
        return new UserDto(u.getId(), u.getEmail(), u.getDisplayName(), u.getTimezone(),
                u.getFocusGoalMinutes(), u.isDemo(), u.getCreatedAt());
    }
}
