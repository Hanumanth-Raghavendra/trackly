package dev.trackly.core.habit;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface HabitRepository extends JpaRepository<Habit, UUID> {

    List<Habit> findByUserIdOrderByPositionAscCreatedAtAsc(UUID userId);

    Optional<Habit> findByIdAndUserId(UUID id, UUID userId);

    List<Habit> findByUserIdAndGoalId(UUID userId, UUID goalId);

    @Query("select coalesce(max(h.position), 0) from Habit h where h.userId = ?1")
    int maxPosition(UUID userId);
}
