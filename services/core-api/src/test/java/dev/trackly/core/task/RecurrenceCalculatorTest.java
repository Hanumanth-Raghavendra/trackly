package dev.trackly.core.task;

import static org.assertj.core.api.Assertions.assertThat;

import dev.trackly.core.task.TaskEnums.Recurrence;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.junit.jupiter.api.Test;

class RecurrenceCalculatorTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final ZoneId NEW_YORK = ZoneId.of("America/New_York");

    private static Instant ist(int y, int m, int d, int h) {
        return ZonedDateTime.of(y, m, d, h, 0, 0, 0, IST).toInstant();
    }

    @Test
    void dailyMovesOneDay() {
        Instant due = ist(2026, 10, 29, 9);
        Instant next = RecurrenceCalculator.next(Recurrence.DAILY, due, ist(2026, 10, 29, 8), IST);
        assertThat(next).isEqualTo(ist(2026, 10, 30, 9));
    }

    @Test
    void weekdaysSkipTheWeekend() {
        Instant friday = ist(2026, 10, 30, 9);
        Instant next = RecurrenceCalculator.next(Recurrence.WEEKDAYS, friday, ist(2026, 10, 30, 8), IST);
        assertThat(next).isEqualTo(ist(2026, 11, 2, 9)); // Monday
    }

    @Test
    void lateCompletionSchedulesTheNextFutureOccurrence() {
        Instant threeDaysAgo = ist(2026, 10, 26, 9);
        Instant now = ist(2026, 10, 29, 12);
        Instant next = RecurrenceCalculator.next(Recurrence.DAILY, threeDaysAgo, now, IST);
        assertThat(next).isEqualTo(ist(2026, 10, 30, 9));
    }

    @Test
    void monthlyKeepsTheDayOfMonthWhenPossible() {
        Instant due = ist(2026, 1, 31, 10);
        Instant next = RecurrenceCalculator.next(Recurrence.MONTHLY, due, ist(2026, 1, 31, 9), IST);
        assertThat(next).isEqualTo(ist(2026, 2, 28, 10)); // clamps to the last day of February
    }

    @Test
    void keepsLocalWallClockTimeAcrossDaylightSaving() {
        // US DST ends on 1 Nov 2026: 9am local must stay 9am local.
        Instant due = ZonedDateTime.of(2026, 10, 31, 9, 0, 0, 0, NEW_YORK).toInstant();
        Instant next = RecurrenceCalculator.next(Recurrence.DAILY, due, due.minusSeconds(60), NEW_YORK);
        assertThat(next.atZone(NEW_YORK).getHour()).isEqualTo(9);
        assertThat(next.atZone(NEW_YORK).getDayOfMonth()).isEqualTo(1);
    }
}
