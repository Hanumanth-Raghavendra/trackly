package dev.trackly.core.habit;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * When a habit is expected to be done.
 *
 * <ul>
 *   <li>{@code DAILY}: every day.</li>
 *   <li>{@code SPECIFIC_DAYS}: on the weekdays in {@code daysMask} (Mon=1, Tue=2, Wed=4 ... Sun=64).</li>
 *   <li>{@code WEEKLY_TIMES}: any {@code targetPerWeek} days in each Monday-Sunday week.</li>
 * </ul>
 */
public record HabitSchedule(Frequency frequency, int targetPerWeek, int daysMask) {

    public enum Frequency { DAILY, WEEKLY_TIMES, SPECIFIC_DAYS }

    public static final int ALL_DAYS = 127;

    public static HabitSchedule daily() {
        return new HabitSchedule(Frequency.DAILY, 7, ALL_DAYS);
    }

    public boolean isWeekly() {
        return frequency == Frequency.WEEKLY_TIMES;
    }

    /** For day-based schedules: is this calendar day a scheduled day? */
    public boolean isScheduled(LocalDate day) {
        return switch (frequency) {
            case DAILY -> true;
            case SPECIFIC_DAYS -> isDaySet(daysMask, day.getDayOfWeek());
            case WEEKLY_TIMES -> true; // any day may count towards the weekly target
        };
    }

    public static boolean isDaySet(int mask, DayOfWeek dow) {
        return (mask & (1 << (dow.getValue() - 1))) != 0;
    }

    public static int maskOf(List<DayOfWeek> days) {
        int mask = 0;
        for (DayOfWeek d : days) {
            mask |= 1 << (d.getValue() - 1);
        }
        return mask;
    }

    public static List<DayOfWeek> daysOf(int mask) {
        List<DayOfWeek> days = new ArrayList<>();
        for (DayOfWeek d : DayOfWeek.values()) {
            if (isDaySet(mask, d)) {
                days.add(d);
            }
        }
        return days;
    }
}
