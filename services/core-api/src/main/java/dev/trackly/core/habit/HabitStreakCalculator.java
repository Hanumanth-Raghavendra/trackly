package dev.trackly.core.habit;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.Collections;
import java.util.Set;

/**
 * Pure streak/consistency maths for a habit — no Spring, no database, fully unit-tested.
 *
 * <p>Rules:
 * <ul>
 *   <li>Day-based habits count consecutive <em>scheduled</em> days that were checked in;
 *       unscheduled days neither extend nor break a streak.</li>
 *   <li>Today never breaks a streak: until midnight you can still check in.</li>
 *   <li>Weekly habits count consecutive weeks (Mon-Sun) that met the target; the current week
 *       only adds to the streak once its target is met.</li>
 *   <li>Freeze check-ins count as done (that's the point of a streak freeze).</li>
 * </ul>
 */
public final class HabitStreakCalculator {

    public record Stats(
            int currentStreak,
            int longestStreak,
            String streakUnit,
            double completionRate30d,
            int totalCheckins,
            boolean doneToday,
            boolean dueToday,
            int doneThisWeek) {}

    private HabitStreakCalculator() {}

    public static Stats compute(HabitSchedule schedule, LocalDate createdOn, Set<LocalDate> checkins, LocalDate today) {
        Set<LocalDate> done = checkins == null ? Collections.emptySet() : checkins;
        LocalDate start = done.stream().min(LocalDate::compareTo)
                .filter(d -> d.isBefore(createdOn)).orElse(createdOn);
        if (start.isAfter(today)) {
            start = today;
        }
        boolean doneToday = done.contains(today);
        int doneThisWeek = countInWeek(done, weekStart(today));
        return schedule.isWeekly()
                ? weekly(schedule, start, done, today, doneToday, doneThisWeek)
                : daily(schedule, start, done, today, doneToday, doneThisWeek);
    }

    private static Stats daily(HabitSchedule s, LocalDate start, Set<LocalDate> done, LocalDate today,
                               boolean doneToday, int doneThisWeek) {
        // Current streak: walk backwards from today.
        int current = 0;
        for (LocalDate d = today; !d.isBefore(start); d = d.minusDays(1)) {
            if (!s.isScheduled(d)) {
                continue;
            }
            if (done.contains(d)) {
                current++;
            } else if (!d.equals(today)) {
                break;
            }
        }

        // Longest streak: walk forwards from the start.
        int longest = 0;
        int run = 0;
        for (LocalDate d = start; !d.isAfter(today); d = d.plusDays(1)) {
            if (!s.isScheduled(d)) {
                continue;
            }
            if (done.contains(d)) {
                run++;
                longest = Math.max(longest, run);
            } else if (!d.equals(today)) {
                run = 0;
            }
        }

        // Consistency over the last 30 days (only days since the habit existed; today only if done).
        LocalDate windowStart = max(start, today.minusDays(29));
        int scheduled = 0;
        int hit = 0;
        for (LocalDate d = windowStart; !d.isAfter(today); d = d.plusDays(1)) {
            if (!s.isScheduled(d) || (d.equals(today) && !doneToday)) {
                continue;
            }
            scheduled++;
            if (done.contains(d)) {
                hit++;
            }
        }
        double rate = scheduled == 0 ? (doneToday ? 1.0 : 0.0) : (double) hit / scheduled;

        return new Stats(current, Math.max(longest, current), "days", round(rate), done.size(),
                doneToday, s.isScheduled(today), doneThisWeek);
    }

    private static Stats weekly(HabitSchedule s, LocalDate start, Set<LocalDate> done, LocalDate today,
                                boolean doneToday, int doneThisWeek) {
        int target = Math.max(1, s.targetPerWeek());
        LocalDate thisWeek = weekStart(today);
        LocalDate firstWeek = weekStart(start);

        int current = 0;
        for (LocalDate w = thisWeek; !w.isBefore(firstWeek); w = w.minusWeeks(1)) {
            boolean met = countInWeek(done, w) >= target;
            if (met) {
                current++;
            } else if (!w.equals(thisWeek)) {
                break;
            }
        }

        int longest = 0;
        int run = 0;
        for (LocalDate w = firstWeek; !w.isAfter(thisWeek); w = w.plusWeeks(1)) {
            if (countInWeek(done, w) >= target) {
                run++;
                longest = Math.max(longest, run);
            } else if (!w.equals(thisWeek)) {
                run = 0;
            }
        }

        LocalDate windowStart = max(start, today.minusDays(27));
        long days = ChronoUnit.DAYS.between(windowStart, today) + 1;
        double expected = target * (days / 7.0);
        long hits = done.stream().filter(d -> !d.isBefore(windowStart) && !d.isAfter(today)).count();
        double rate = expected <= 0 ? 0 : Math.min(1.0, hits / expected);

        return new Stats(current, Math.max(longest, current), "weeks", round(rate), done.size(),
                doneToday, doneThisWeek < target, doneThisWeek);
    }

    static LocalDate weekStart(LocalDate day) {
        return day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    private static int countInWeek(Set<LocalDate> done, LocalDate weekStart) {
        int count = 0;
        for (int i = 0; i < 7; i++) {
            if (done.contains(weekStart.plusDays(i))) {
                count++;
            }
        }
        return count;
    }

    private static LocalDate max(LocalDate a, LocalDate b) {
        return a.isAfter(b) ? a : b;
    }

    private static double round(double v) {
        return Math.round(v * 1000.0) / 1000.0;
    }
}
