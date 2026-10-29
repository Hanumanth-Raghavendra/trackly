package dev.trackly.core.habit;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

public final class HabitDtos {

    private HabitDtos() {}

    public record HabitDto(
            UUID id,
            String name,
            String description,
            String icon,
            String color,
            HabitSchedule.Frequency frequencyType,
            int targetPerWeek,
            List<DayOfWeek> daysOfWeek,
            LocalTime reminderTime,
            UUID goalId,
            int freezeTokens,
            boolean archived,
            int position,
            Instant createdAt,
            HabitStreakCalculator.Stats stats,
            /* checked-in days in the last 35 days, for week strips in the UI */
            List<LocalDate> recentCheckins) {}

    public record CheckinDto(UUID habitId, LocalDate day, String note, Short mood, boolean freeze) {
        static CheckinDto from(HabitCheckin c) {
            return new CheckinDto(c.getHabitId(), c.getDay(), c.getNote(), c.getMood(), c.isFreeze());
        }
    }

    public record CreateHabit(
            @NotBlank @Size(max = 80) String name,
            @Size(max = 500) String description,
            @Size(max = 16) String icon,
            @Size(max = 16) String color,
            HabitSchedule.Frequency frequencyType,
            @Min(1) @Max(7) Integer targetPerWeek,
            List<DayOfWeek> daysOfWeek,
            LocalTime reminderTime,
            UUID goalId) {}

    /** All fields optional; reminderTime/goalId can be cleared with the clear* flags. */
    public record UpdateHabit(
            @Size(min = 1, max = 80) String name,
            @Size(max = 500) String description,
            @Size(max = 16) String icon,
            @Size(max = 16) String color,
            HabitSchedule.Frequency frequencyType,
            @Min(1) @Max(7) Integer targetPerWeek,
            List<DayOfWeek> daysOfWeek,
            LocalTime reminderTime,
            Boolean clearReminder,
            UUID goalId,
            Boolean clearGoal,
            Boolean archived,
            Integer position) {}

    public record CheckinRequest(@Size(max = 500) String note, @Min(1) @Max(5) Short mood) {}
}
