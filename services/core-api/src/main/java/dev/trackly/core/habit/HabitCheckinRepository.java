package dev.trackly.core.habit;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HabitCheckinRepository extends JpaRepository<HabitCheckin, UUID> {

    Optional<HabitCheckin> findByHabitIdAndDay(UUID habitId, LocalDate day);

    List<HabitCheckin> findByHabitIdIn(Collection<UUID> habitIds);

    List<HabitCheckin> findByUserIdAndDayBetweenOrderByDayAsc(UUID userId, LocalDate from, LocalDate to);

    List<HabitCheckin> findByHabitIdOrderByDayAsc(UUID habitId);
}
