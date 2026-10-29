package dev.trackly.core.habit;

import dev.trackly.core.common.ApiException;
import dev.trackly.core.common.Colors;
import dev.trackly.core.goal.GoalRepository;
import dev.trackly.core.outbox.EventTypes;
import dev.trackly.core.outbox.OutboxPublisher;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HabitService {

    /** How far back a check-in may be added or undone (lets people fix yesterday's forgotten tap). */
    static final int BACKFILL_DAYS = 30;
    /** A missed day can only be "frozen" within this window. */
    static final int FREEZE_WINDOW_DAYS = 7;
    static final int MAX_FREEZE_TOKENS = 3;

    private final HabitRepository habits;
    private final HabitCheckinRepository checkins;
    private final GoalRepository goals;
    private final OutboxPublisher outbox;
    private final Clock clock;

    public HabitService(HabitRepository habits, HabitCheckinRepository checkins, GoalRepository goals,
                        OutboxPublisher outbox, Clock clock) {
        this.habits = habits;
        this.checkins = checkins;
        this.goals = goals;
        this.outbox = outbox;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<HabitDtos.HabitDto> list(UUID userId, ZoneId zone, boolean includeArchived) {
        List<Habit> all = habits.findByUserIdOrderByPositionAscCreatedAtAsc(userId).stream()
                .filter(h -> includeArchived || !h.isArchived())
                .toList();
        Map<UUID, Set<LocalDate>> daysByHabit = new HashMap<>();
        checkins.findByHabitIdIn(all.stream().map(Habit::getId).toList())
                .forEach(c -> daysByHabit.computeIfAbsent(c.getHabitId(), k -> new HashSet<>()).add(c.getDay()));
        LocalDate today = LocalDate.now(clock.withZone(zone));
        return all.stream().map(h -> toDto(h, daysByHabit.getOrDefault(h.getId(), Set.of()), today, zone)).toList();
    }

    @Transactional(readOnly = true)
    public HabitDtos.HabitDto get(UUID userId, ZoneId zone, UUID id) {
        Habit h = load(userId, id);
        Set<LocalDate> days = checkins.findByHabitIdOrderByDayAsc(id).stream()
                .map(HabitCheckin::getDay).collect(Collectors.toSet());
        return toDto(h, days, LocalDate.now(clock.withZone(zone)), zone);
    }

    @Transactional(readOnly = true)
    public List<HabitDtos.CheckinDto> checkins(UUID userId, LocalDate from, LocalDate to) {
        if (from.isAfter(to) || from.plusDays(400).isBefore(to)) {
            throw ApiException.badRequest("INVALID_RANGE", "Range must be at most 400 days");
        }
        return checkins.findByUserIdAndDayBetweenOrderByDayAsc(userId, from, to).stream()
                .map(HabitDtos.CheckinDto::from).toList();
    }

    @Transactional
    public HabitDtos.HabitDto create(UUID userId, ZoneId zone, HabitDtos.CreateHabit req) {
        Habit h = new Habit(userId, req.name().trim());
        h.setDescription(blankToNull(req.description()));
        h.setIcon(req.icon() == null || req.icon().isBlank() ? "✅" : req.icon().trim());
        h.setColor(Colors.orDefault(req.color(), "#10b981"));
        applySchedule(h, req.frequencyType(), req.targetPerWeek(), req.daysOfWeek());
        h.setReminderTime(req.reminderTime());
        h.setGoalId(checkGoal(userId, req.goalId()));
        h.setPosition(habits.maxPosition(userId) + 1);
        habits.save(h);
        publish(h, EventTypes.HABIT_CREATED);
        return toDto(h, Set.of(), LocalDate.now(clock.withZone(zone)), zone);
    }

    @Transactional
    public HabitDtos.HabitDto update(UUID userId, ZoneId zone, UUID id, HabitDtos.UpdateHabit req) {
        Habit h = load(userId, id);
        if (req.name() != null) {
            h.setName(req.name().trim());
        }
        if (req.description() != null) {
            h.setDescription(blankToNull(req.description()));
        }
        if (req.icon() != null && !req.icon().isBlank()) {
            h.setIcon(req.icon().trim());
        }
        if (req.color() != null) {
            h.setColor(Colors.orDefault(req.color(), h.getColor()));
        }
        if (req.frequencyType() != null || req.targetPerWeek() != null || req.daysOfWeek() != null) {
            applySchedule(h,
                    req.frequencyType() != null ? req.frequencyType() : h.getFrequencyType(),
                    req.targetPerWeek() != null ? req.targetPerWeek() : h.getTargetPerWeek(),
                    req.daysOfWeek() != null ? req.daysOfWeek() : HabitSchedule.daysOf(h.getDaysOfWeek()));
        }
        if (Boolean.TRUE.equals(req.clearReminder())) {
            h.setReminderTime(null);
        } else if (req.reminderTime() != null) {
            h.setReminderTime(req.reminderTime());
        }
        if (Boolean.TRUE.equals(req.clearGoal())) {
            h.setGoalId(null);
        } else if (req.goalId() != null) {
            h.setGoalId(checkGoal(userId, req.goalId()));
        }
        if (req.archived() != null) {
            h.setArchived(req.archived());
        }
        if (req.position() != null) {
            h.setPosition(req.position());
        }
        habits.saveAndFlush(h);
        publish(h, EventTypes.HABIT_UPDATED);
        return get(userId, zone, id);
    }

    @Transactional
    public void delete(UUID userId, UUID id) {
        Habit h = load(userId, id);
        outbox.publish(userId, EventTypes.HABIT, h.getId(), EventTypes.HABIT_DELETED,
                Map.of("id", h.getId().toString()), clock.instant());
        habits.delete(h);
    }

    /** Idempotent: checking in twice for the same day just updates the note/mood. */
    @Transactional
    public HabitDtos.HabitDto checkIn(UUID userId, ZoneId zone, UUID habitId, LocalDate day,
                                      HabitDtos.CheckinRequest req) {
        Habit h = load(userId, habitId);
        LocalDate today = LocalDate.now(clock.withZone(zone));
        validateDay(day, today, BACKFILL_DAYS);

        HabitCheckin c = checkins.findByHabitIdAndDay(habitId, day).orElse(null);
        boolean isNew = c == null;
        if (isNew) {
            c = new HabitCheckin(habitId, userId, day);
        }
        if (req != null) {
            c.setNote(blankToNull(req.note()));
            c.setMood(req.mood());
        }
        c.setFreeze(false);
        checkins.saveAndFlush(c);

        HabitDtos.HabitDto dto = get(userId, zone, habitId);
        if (isNew) {
            if (maybeAwardFreezeToken(h, dto.stats())) {
                dto = get(userId, zone, habitId);
            }
            outbox.publish(userId, EventTypes.HABIT, habitId, EventTypes.HABIT_CHECKED,
                    HabitEvents.checkin(c, clock.instant()), clock.instant());
        }
        return dto;
    }

    @Transactional
    public HabitDtos.HabitDto uncheck(UUID userId, ZoneId zone, UUID habitId, LocalDate day) {
        load(userId, habitId);
        validateDay(day, LocalDate.now(clock.withZone(zone)), BACKFILL_DAYS);
        checkins.findByHabitIdAndDay(habitId, day).ifPresent(c -> {
            checkins.delete(c);
            checkins.flush();
            outbox.publish(userId, EventTypes.HABIT, habitId, EventTypes.HABIT_UNCHECKED,
                    Map.of("habitId", habitId.toString(), "date", day.toString()), clock.instant());
        });
        return get(userId, zone, habitId);
    }

    /** Spends a freeze token to protect the streak for a missed day in the last week. */
    @Transactional
    public HabitDtos.HabitDto freeze(UUID userId, ZoneId zone, UUID habitId, LocalDate day) {
        Habit h = load(userId, habitId);
        LocalDate today = LocalDate.now(clock.withZone(zone));
        if (!day.isBefore(today)) {
            throw ApiException.badRequest("FREEZE_TODAY", "Freezes are for missed past days - just check in today");
        }
        validateDay(day, today, FREEZE_WINDOW_DAYS);
        if (h.getFreezeTokens() <= 0) {
            throw ApiException.conflict("NO_FREEZE_TOKENS", "No streak freezes left. Earn one every 7-day streak.");
        }
        if (checkins.findByHabitIdAndDay(habitId, day).isPresent()) {
            throw ApiException.conflict("ALREADY_DONE", "That day is already checked in");
        }
        HabitCheckin c = new HabitCheckin(habitId, userId, day);
        c.setFreeze(true);
        checkins.saveAndFlush(c);
        h.setFreezeTokens(h.getFreezeTokens() - 1);
        outbox.publish(userId, EventTypes.HABIT, habitId, EventTypes.HABIT_CHECKED,
                HabitEvents.checkin(c, clock.instant()), clock.instant());
        return get(userId, zone, habitId);
    }

    /** Average 30-day consistency of habits linked to a goal (used for goal progress). */
    @Transactional(readOnly = true)
    public Map<UUID, Double> consistencyByGoal(UUID userId, ZoneId zone) {
        Map<UUID, double[]> acc = new HashMap<>();
        for (HabitDtos.HabitDto h : list(userId, zone, false)) {
            if (h.goalId() == null) {
                continue;
            }
            double[] sumCount = acc.computeIfAbsent(h.goalId(), k -> new double[2]);
            sumCount[0] += h.stats().completionRate30d();
            sumCount[1]++;
        }
        Map<UUID, Double> out = new HashMap<>();
        acc.forEach((goal, sc) -> out.put(goal, sc[0] / sc[1]));
        return out;
    }

    /** Every 7-day streak milestone earns a freeze token (max 3). */
    private boolean maybeAwardFreezeToken(Habit h, HabitStreakCalculator.Stats stats) {
        if ("days".equals(stats.streakUnit()) && stats.currentStreak() > 0 && stats.currentStreak() % 7 == 0
                && h.getFreezeTokens() < MAX_FREEZE_TOKENS) {
            h.setFreezeTokens(h.getFreezeTokens() + 1);
            return true;
        }
        return false;
    }

    private HabitDtos.HabitDto toDto(Habit h, Set<LocalDate> days, LocalDate today, ZoneId zone) {
        LocalDate createdOn = h.getCreatedAt() == null ? today : h.getCreatedAt().atZone(zone).toLocalDate();
        var stats = HabitStreakCalculator.compute(h.schedule(), createdOn, days, today);
        LocalDate recentFrom = today.minusDays(34);
        List<LocalDate> recent = days.stream().filter(d -> !d.isBefore(recentFrom) && !d.isAfter(today))
                .sorted().toList();
        return new HabitDtos.HabitDto(h.getId(), h.getName(), h.getDescription(), h.getIcon(), h.getColor(),
                h.getFrequencyType(), h.getTargetPerWeek(), HabitSchedule.daysOf(h.getDaysOfWeek()),
                h.getReminderTime(), h.getGoalId(), h.getFreezeTokens(), h.isArchived(), h.getPosition(),
                h.getCreatedAt(), stats, recent);
    }

    private static void applySchedule(Habit h, HabitSchedule.Frequency freq, Integer target, List<DayOfWeek> days) {
        HabitSchedule.Frequency f = freq == null ? HabitSchedule.Frequency.DAILY : freq;
        h.setFrequencyType(f);
        switch (f) {
            case DAILY -> {
                h.setTargetPerWeek(7);
                h.setDaysOfWeek(HabitSchedule.ALL_DAYS);
            }
            case WEEKLY_TIMES -> {
                h.setTargetPerWeek(target == null ? 3 : target);
                h.setDaysOfWeek(HabitSchedule.ALL_DAYS);
            }
            case SPECIFIC_DAYS -> {
                if (days == null || days.isEmpty()) {
                    throw ApiException.badRequest("VALIDATION_FAILED", "Pick at least one day of the week");
                }
                int mask = HabitSchedule.maskOf(days);
                h.setDaysOfWeek(mask);
                h.setTargetPerWeek(Integer.bitCount(mask));
            }
        }
    }

    private void validateDay(LocalDate day, LocalDate today, int maxDaysBack) {
        if (day.isAfter(today)) {
            throw ApiException.badRequest("FUTURE_DATE", "You can't check in for a future day");
        }
        if (day.isBefore(today.minusDays(maxDaysBack))) {
            throw ApiException.badRequest("TOO_OLD", "That day is too far in the past");
        }
    }

    private Habit load(UUID userId, UUID id) {
        return habits.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Habit"));
    }

    private UUID checkGoal(UUID userId, UUID goalId) {
        if (goalId != null && !goals.existsByIdAndUserId(goalId, userId)) {
            throw ApiException.badRequest("UNKNOWN_GOAL", "Goal not found");
        }
        return goalId;
    }

    private void publish(Habit h, String type) {
        outbox.publish(h.getUserId(), EventTypes.HABIT, h.getId(), type, HabitEvents.snapshot(h), clock.instant());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
