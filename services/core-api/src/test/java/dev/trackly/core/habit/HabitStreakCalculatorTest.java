package dev.trackly.core.habit;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class HabitStreakCalculatorTest {

    // 2026-10-29 is a Thursday.
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 29);

    private static Set<LocalDate> daysBack(int... offsets) {
        Set<LocalDate> s = new HashSet<>();
        for (int o : offsets) {
            s.add(TODAY.minusDays(o));
        }
        return s;
    }

    @Nested
    class Daily {

        private final HabitSchedule daily = HabitSchedule.daily();

        @Test
        void countsConsecutiveDaysIncludingToday() {
            var stats = HabitStreakCalculator.compute(daily, TODAY.minusDays(30), daysBack(0, 1, 2, 3), TODAY);
            assertThat(stats.currentStreak()).isEqualTo(4);
            assertThat(stats.doneToday()).isTrue();
        }

        @Test
        void todayNotDoneYetDoesNotBreakTheStreak() {
            var stats = HabitStreakCalculator.compute(daily, TODAY.minusDays(30), daysBack(1, 2, 3), TODAY);
            assertThat(stats.currentStreak()).isEqualTo(3);
            assertThat(stats.dueToday()).isTrue();
        }

        @Test
        void aMissedDayBreaksTheStreakButLongestIsRemembered() {
            var stats = HabitStreakCalculator.compute(daily, TODAY.minusDays(30),
                    daysBack(0, 1, 3, 4, 5, 6, 7, 8), TODAY);
            assertThat(stats.currentStreak()).isEqualTo(2);
            assertThat(stats.longestStreak()).isEqualTo(6);
        }

        @Test
        void consistencyIgnoresDaysBeforeTheHabitExisted() {
            // Created 4 days ago, done on 3 of the 4 finished days.
            var stats = HabitStreakCalculator.compute(daily, TODAY.minusDays(4), daysBack(1, 2, 4), TODAY);
            assertThat(stats.completionRate30d()).isEqualTo(0.75);
        }
    }

    @Nested
    class SpecificDays {

        // Mondays and Thursdays only.
        private final HabitSchedule monThu = new HabitSchedule(HabitSchedule.Frequency.SPECIFIC_DAYS, 2,
                HabitSchedule.maskOf(List.of(DayOfWeek.MONDAY, DayOfWeek.THURSDAY)));

        @Test
        void unscheduledDaysNeitherExtendNorBreakTheStreak() {
            // Thu 29 (today), Mon 26, Thu 22, Mon 19 => 4 in a row; Tue/Wed/Fri gaps don't matter.
            var stats = HabitStreakCalculator.compute(monThu, TODAY.minusDays(30), daysBack(0, 3, 7, 10), TODAY);
            assertThat(stats.currentStreak()).isEqualTo(4);
        }

        @Test
        void notDueOnUnscheduledDays() {
            var friday = TODAY.plusDays(1);
            var stats = HabitStreakCalculator.compute(monThu, TODAY.minusDays(30), Set.of(), friday);
            assertThat(stats.dueToday()).isFalse();
        }
    }

    @Nested
    class WeeklyTarget {

        private final HabitSchedule threePerWeek = new HabitSchedule(HabitSchedule.Frequency.WEEKLY_TIMES, 3,
                HabitSchedule.ALL_DAYS);

        @Test
        void countsWeeksThatMetTheTarget() {
            // Current week (Mon 26 - Sun 1): 3 done. Previous week: 3 done. Week before: 1.
            Set<LocalDate> done = daysBack(0, 1, 3, 7, 9, 10, 14);
            var stats = HabitStreakCalculator.compute(threePerWeek, TODAY.minusDays(40), done, TODAY);
            assertThat(stats.streakUnit()).isEqualTo("weeks");
            assertThat(stats.currentStreak()).isEqualTo(2);
            assertThat(stats.dueToday()).isFalse(); // target already met this week
        }

        @Test
        void unfinishedCurrentWeekDoesNotBreakTheStreak() {
            Set<LocalDate> done = daysBack(0, 7, 9, 10);
            var stats = HabitStreakCalculator.compute(threePerWeek, TODAY.minusDays(40), done, TODAY);
            assertThat(stats.currentStreak()).isEqualTo(1);
            assertThat(stats.doneThisWeek()).isEqualTo(1);
            assertThat(stats.dueToday()).isTrue();
        }
    }

    @Test
    void emptyHistoryIsAllZeros() {
        var stats = HabitStreakCalculator.compute(HabitSchedule.daily(), TODAY, Set.of(), TODAY);
        assertThat(stats.currentStreak()).isZero();
        assertThat(stats.longestStreak()).isZero();
        assertThat(stats.completionRate30d()).isZero();
    }
}
