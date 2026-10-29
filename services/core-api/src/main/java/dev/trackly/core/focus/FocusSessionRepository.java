package dev.trackly.core.focus;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FocusSessionRepository extends JpaRepository<FocusSession, UUID> {

    List<FocusSession> findByUserIdAndStartedAtBetweenOrderByStartedAtDesc(UUID userId, Instant from, Instant to);

    Optional<FocusSession> findByIdAndUserId(UUID id, UUID userId);
}
