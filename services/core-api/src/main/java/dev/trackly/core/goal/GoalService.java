package dev.trackly.core.goal;

import dev.trackly.core.common.ApiException;
import dev.trackly.core.common.Colors;
import dev.trackly.core.habit.HabitRepository;
import dev.trackly.core.habit.HabitService;
import dev.trackly.core.outbox.EventTypes;
import dev.trackly.core.outbox.OutboxPublisher;
import dev.trackly.core.task.TaskRepository;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GoalService {

    public record GoalDto(UUID id, String title, String description, String color, LocalDate targetDate,
                          Goal.Status status, Instant completedAt, Instant createdAt, Progress progress) {}

    /**
     * Progress blends linked tasks (70%) and linked habits' 30-day consistency (30%);
     * if only one kind is linked, it counts 100%.
     */
    public record Progress(int percent, long tasksTotal, long tasksDone, int habitCount, double habitConsistency) {}

    public record CreateGoal(@NotBlank @Size(max = 120) String title, @Size(max = 2000) String description,
                             @Size(max = 16) String color, LocalDate targetDate) {}

    public record UpdateGoal(@Size(min = 1, max = 120) String title, @Size(max = 2000) String description,
                             @Size(max = 16) String color, LocalDate targetDate, Boolean clearTargetDate,
                             Goal.Status status) {}

    private final GoalRepository goals;
    private final TaskRepository tasks;
    private final HabitRepository habits;
    private final HabitService habitService;
    private final OutboxPublisher outbox;
    private final Clock clock;

    public GoalService(GoalRepository goals, TaskRepository tasks, HabitRepository habits, HabitService habitService,
                       OutboxPublisher outbox, Clock clock) {
        this.goals = goals;
        this.tasks = tasks;
        this.habits = habits;
        this.habitService = habitService;
        this.outbox = outbox;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<GoalDto> list(UUID userId, ZoneId zone) {
        Map<UUID, long[]> taskCounts = new HashMap<>();
        for (Object[] row : tasks.goalProgress(userId)) {
            taskCounts.put((UUID) row[0], new long[] {((Number) row[1]).longValue(), ((Number) row[2]).longValue()});
        }
        Map<UUID, Double> consistency = habitService.consistencyByGoal(userId, zone);
        Map<UUID, Integer> habitCounts = new HashMap<>();
        habits.findByUserIdOrderByPositionAscCreatedAtAsc(userId).stream()
                .filter(h -> h.getGoalId() != null && !h.isArchived())
                .forEach(h -> habitCounts.merge(h.getGoalId(), 1, Integer::sum));

        return goals.findByUserIdOrderByCreatedAtAsc(userId).stream()
                .map(g -> toDto(g, taskCounts.get(g.getId()), habitCounts.getOrDefault(g.getId(), 0),
                        consistency.getOrDefault(g.getId(), 0.0)))
                .toList();
    }

    @Transactional
    public GoalDto create(UUID userId, ZoneId zone, CreateGoal req) {
        Goal g = new Goal(userId, req.title().trim(), Colors.orDefault(req.color(), "#f59e0b"));
        g.setDescription(blankToNull(req.description()));
        g.setTargetDate(req.targetDate());
        goals.save(g);
        publish(g, EventTypes.GOAL_CREATED);
        return find(userId, zone, g.getId());
    }

    @Transactional
    public GoalDto update(UUID userId, ZoneId zone, UUID id, UpdateGoal req) {
        Goal g = load(userId, id);
        Goal.Status before = g.getStatus();
        if (req.title() != null) {
            g.setTitle(req.title().trim());
        }
        if (req.description() != null) {
            g.setDescription(blankToNull(req.description()));
        }
        if (req.color() != null) {
            g.setColor(Colors.orDefault(req.color(), g.getColor()));
        }
        if (Boolean.TRUE.equals(req.clearTargetDate())) {
            g.setTargetDate(null);
        } else if (req.targetDate() != null) {
            g.setTargetDate(req.targetDate());
        }
        if (req.status() != null) {
            g.setStatus(req.status(), clock.instant());
        }
        goals.saveAndFlush(g);
        boolean justCompleted = before != Goal.Status.COMPLETED && g.getStatus() == Goal.Status.COMPLETED;
        publish(g, justCompleted ? EventTypes.GOAL_COMPLETED : EventTypes.GOAL_UPDATED);
        return find(userId, zone, id);
    }

    @Transactional
    public void delete(UUID userId, UUID id) {
        Goal g = load(userId, id);
        outbox.publish(userId, EventTypes.GOAL, id, EventTypes.GOAL_DELETED, Map.of("id", id.toString()),
                clock.instant());
        goals.delete(g); // linked tasks/habits keep existing (FK SET NULL)
    }

    private GoalDto find(UUID userId, ZoneId zone, UUID id) {
        return list(userId, zone).stream().filter(d -> d.id().equals(id)).findFirst()
                .orElseThrow(() -> ApiException.notFound("Goal"));
    }

    static Progress progress(Goal.Status status, long[] taskCounts, int habitCount, double habitConsistency) {
        long total = taskCounts == null ? 0 : taskCounts[0];
        long done = taskCounts == null ? 0 : taskCounts[1];
        double taskPct = total == 0 ? 0 : (double) done / total;
        double pct;
        if (status == Goal.Status.COMPLETED) {
            pct = 1.0;
        } else if (total > 0 && habitCount > 0) {
            pct = 0.7 * taskPct + 0.3 * habitConsistency;
        } else if (total > 0) {
            pct = taskPct;
        } else if (habitCount > 0) {
            pct = habitConsistency;
        } else {
            pct = 0;
        }
        return new Progress((int) Math.round(pct * 100), total, done, habitCount,
                Math.round(habitConsistency * 1000) / 1000.0);
    }

    private GoalDto toDto(Goal g, long[] taskCounts, int habitCount, double consistency) {
        return new GoalDto(g.getId(), g.getTitle(), g.getDescription(), g.getColor(), g.getTargetDate(),
                g.getStatus(), g.getCompletedAt(), g.getCreatedAt(),
                progress(g.getStatus(), taskCounts, habitCount, consistency));
    }

    private Goal load(UUID userId, UUID id) {
        return goals.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Goal"));
    }

    private void publish(Goal g, String type) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("id", g.getId().toString());
        p.put("title", g.getTitle());
        p.put("status", g.getStatus().name());
        p.put("targetDate", g.getTargetDate() == null ? null : g.getTargetDate().toString());
        p.put("completedAt", g.getCompletedAt() == null ? null : g.getCompletedAt().toString());
        outbox.publish(g.getUserId(), EventTypes.GOAL, g.getId(), type, p, clock.instant());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
