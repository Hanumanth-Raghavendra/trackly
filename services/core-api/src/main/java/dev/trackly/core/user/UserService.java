package dev.trackly.core.user;

import dev.trackly.core.common.ApiException;
import dev.trackly.core.common.Zones;
import dev.trackly.core.outbox.EventTypes;
import dev.trackly.core.outbox.OutboxPublisher;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final OutboxPublisher outbox;
    private final Clock clock;

    public UserService(UserRepository users, PasswordEncoder passwordEncoder, OutboxPublisher outbox, Clock clock) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.outbox = outbox;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public User get(UUID userId) {
        return users.findById(userId).orElseThrow(() -> ApiException.notFound("User"));
    }

    @Transactional
    public User update(UUID userId, UserRequests.UpdateProfile req) {
        User user = get(userId);
        if (req.displayName() != null && !req.displayName().isBlank()) {
            user.setDisplayName(req.displayName().trim());
        }
        if (req.timezone() != null) {
            user.setTimezone(Zones.normalize(req.timezone()));
        }
        if (req.focusGoalMinutes() != null) {
            user.setFocusGoalMinutes(req.focusGoalMinutes());
        }
        users.saveAndFlush(user);
        outbox.publish(user.getId(), EventTypes.USER, user.getId(), EventTypes.USER_UPDATED,
                UserEvents.snapshot(user), clock.instant());
        return user;
    }

    @Transactional
    public void changePassword(UUID userId, UserRequests.ChangePassword req) {
        User user = get(userId);
        if (user.isDemo()) {
            throw ApiException.forbidden("DEMO_ACCOUNT", "Demo accounts can't change their password");
        }
        if (!passwordEncoder.matches(req.currentPassword(), user.getPasswordHash())) {
            throw ApiException.badRequest("WRONG_PASSWORD", "Current password is incorrect");
        }
        user.setPasswordHash(passwordEncoder.encode(req.newPassword()));
    }

    /** Deletes the account and everything in it (FK cascades); insights purges its copy on USER_DELETED. */
    @Transactional
    public void delete(UUID userId) {
        User user = get(userId);
        outbox.publish(user.getId(), EventTypes.USER, user.getId(), EventTypes.USER_DELETED,
                Map.of("id", user.getId().toString()), clock.instant());
        users.delete(user);
    }
}
