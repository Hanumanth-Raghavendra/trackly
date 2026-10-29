package dev.trackly.core.task;

import dev.trackly.core.task.TaskEnums.Recurrence;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * Computes the next due date of a recurring task, in the user's own timezone so that
 * "every weekday at 9am" stays 9am local time across DST changes.
 */
public final class RecurrenceCalculator {

    private RecurrenceCalculator() {}

    /**
     * Next occurrence strictly after both the previous due date and {@code now}: completing a daily
     * task three days late schedules the next one for tomorrow, not for two days ago.
     */
    public static Instant next(Recurrence recurrence, Instant previousDue, Instant now, ZoneId zone) {
        ZonedDateTime next = advance(recurrence, previousDue.atZone(zone));
        int guard = 0;
        while (!next.toInstant().isAfter(now) && guard++ < 1000) {
            next = advance(recurrence, next);
        }
        return next.toInstant();
    }

    static ZonedDateTime advance(Recurrence recurrence, ZonedDateTime from) {
        return switch (recurrence) {
            case DAILY -> from.plusDays(1);
            case WEEKLY -> from.plusWeeks(1);
            case MONTHLY -> from.plusMonths(1);
            case WEEKDAYS -> {
                ZonedDateTime d = from.plusDays(1);
                while (d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY) {
                    d = d.plusDays(1);
                }
                yield d;
            }
        };
    }
}
