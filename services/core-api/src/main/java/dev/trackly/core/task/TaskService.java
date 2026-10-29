package dev.trackly.core.task;

import dev.trackly.core.common.ApiException;
import dev.trackly.core.goal.GoalRepository;
import dev.trackly.core.outbox.EventTypes;
import dev.trackly.core.outbox.OutboxPublisher;
import dev.trackly.core.project.ProjectRepository;
import dev.trackly.core.task.TaskEnums.Priority;
import dev.trackly.core.task.TaskEnums.Recurrence;
import dev.trackly.core.task.TaskEnums.Status;
import jakarta.persistence.criteria.Predicate;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TaskService {

    /** Optional list filters; null means "don't filter on this". */
    public record Filter(Status status, UUID projectId, UUID goalId, String query, Instant dueFrom, Instant dueTo,
                         boolean includeDone) {}

    private final TaskRepository tasks;
    private final ProjectRepository projects;
    private final GoalRepository goals;
    private final OutboxPublisher outbox;
    private final Clock clock;

    public TaskService(TaskRepository tasks, ProjectRepository projects, GoalRepository goals, OutboxPublisher outbox,
                       Clock clock) {
        this.tasks = tasks;
        this.projects = projects;
        this.goals = goals;
        this.outbox = outbox;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<Task> list(UUID userId, Filter f) {
        Specification<Task> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("userId"), userId));
            if (f.status() != null) {
                p.add(cb.equal(root.get("status"), f.status()));
            } else if (!f.includeDone()) {
                p.add(cb.notEqual(root.get("status"), Status.DONE));
            }
            if (f.projectId() != null) {
                p.add(cb.equal(root.get("projectId"), f.projectId()));
            }
            if (f.goalId() != null) {
                p.add(cb.equal(root.get("goalId"), f.goalId()));
            }
            if (f.query() != null && !f.query().isBlank()) {
                String like = "%" + f.query().trim().toLowerCase(Locale.ROOT).replace("%", "\\%") + "%";
                p.add(cb.like(cb.lower(root.get("title")), like));
            }
            if (f.dueFrom() != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("dueAt"), f.dueFrom()));
            }
            if (f.dueTo() != null) {
                p.add(cb.lessThan(root.get("dueAt"), f.dueTo()));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        return tasks.findAll(spec, Sort.by(Sort.Order.asc("position"), Sort.Order.desc("createdAt")));
    }

    @Transactional(readOnly = true)
    public Task get(UUID userId, UUID id) {
        return tasks.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Task"));
    }

    @Transactional
    public Task create(UUID userId, TaskRequests.CreateTask req) {
        Task t = new Task(userId, req.title().trim());
        t.setDescription(blankToNull(req.description()));
        t.setPriority(req.priority() == null ? Priority.MEDIUM : req.priority());
        t.setTags(Tags.normalize(req.tags()));
        t.setDueAt(req.dueAt());
        t.setEstimateMinutes(req.estimateMinutes());
        t.setRecurrence(req.recurrence());
        t.setProjectId(checkProject(userId, req.projectId()));
        t.setGoalId(checkGoal(userId, req.goalId()));
        t.setParentId(checkParent(userId, req.parentId(), null));
        Status status = req.status() == null ? Status.TODO : req.status();
        t.setStatus(status == Status.DONE ? Status.TODO : status);
        t.setPosition(tasks.maxPosition(userId, t.getStatus()) + 1000);
        tasks.save(t);
        publish(t, EventTypes.TASK_CREATED);
        if (status == Status.DONE) {
            t.complete(clock.instant());
            publish(t, EventTypes.TASK_COMPLETED);
        }
        return t;
    }

    /**
     * Partial update with JSON Merge Patch semantics (RFC 7396): a key that is present with
     * {@code null} clears the field, a key that is absent leaves it untouched. Records can't tell
     * "absent" from "null", hence the raw map.
     */
    @Transactional
    public TaskRequests.CompleteResult patch(UUID userId, ZoneId zone, UUID id, Map<String, Object> body) {
        Task t = get(userId, id);
        Status before = t.getStatus();

        if (body.containsKey("title")) {
            String title = asString(body.get("title"));
            if (title == null || title.isBlank() || title.length() > 200) {
                throw ApiException.badRequest("VALIDATION_FAILED", "title must be 1-200 characters");
            }
            t.setTitle(title.trim());
        }
        if (body.containsKey("description")) {
            String d = asString(body.get("description"));
            if (d != null && d.length() > 5000) {
                throw ApiException.badRequest("VALIDATION_FAILED", "description is too long");
            }
            t.setDescription(blankToNull(d));
        }
        if (body.containsKey("priority")) {
            t.setPriority(parseEnum(Priority.class, body.get("priority"), "priority", false));
        }
        if (body.containsKey("tags")) {
            Object tags = body.get("tags");
            if (tags != null && !(tags instanceof Collection<?>)) {
                throw ApiException.badRequest("VALIDATION_FAILED", "tags must be an array");
            }
            t.setTags(Tags.normalize((Collection<?>) tags));
        }
        if (body.containsKey("dueAt")) {
            t.setDueAt(parseInstant(body.get("dueAt")));
        }
        if (body.containsKey("estimateMinutes")) {
            Integer est = asInteger(body.get("estimateMinutes"), "estimateMinutes");
            if (est != null && (est < 1 || est > 1440)) {
                throw ApiException.badRequest("VALIDATION_FAILED", "estimateMinutes must be 1-1440");
            }
            t.setEstimateMinutes(est);
        }
        if (body.containsKey("position")) {
            Object pos = body.get("position");
            if (!(pos instanceof Number n)) {
                throw ApiException.badRequest("VALIDATION_FAILED", "position must be a number");
            }
            t.setPosition(n.doubleValue());
        }
        if (body.containsKey("recurrence")) {
            t.setRecurrence(parseEnum(Recurrence.class, body.get("recurrence"), "recurrence", true));
            t.setRecurrenceSpawned(false);
        }
        if (body.containsKey("projectId")) {
            t.setProjectId(checkProject(userId, parseUuid(body.get("projectId"), "projectId")));
        }
        if (body.containsKey("goalId")) {
            t.setGoalId(checkGoal(userId, parseUuid(body.get("goalId"), "goalId")));
        }

        Status requested = body.containsKey("status")
                ? parseEnum(Status.class, body.get("status"), "status", false)
                : before;

        TaskDto next = null;
        if (requested == Status.DONE && before != Status.DONE) {
            next = completeInternal(t, zone);
        } else if (requested != Status.DONE && before == Status.DONE) {
            t.reopen();
            t.setStatus(requested);
            tasks.saveAndFlush(t);
            publish(t, EventTypes.TASK_REOPENED);
        } else {
            t.setStatus(requested);
            tasks.saveAndFlush(t);
            publish(t, EventTypes.TASK_UPDATED);
        }
        return new TaskRequests.CompleteResult(TaskDto.from(t), next);
    }

    @Transactional
    public TaskRequests.CompleteResult complete(UUID userId, ZoneId zone, UUID id) {
        Task t = get(userId, id);
        if (t.getStatus() == Status.DONE) {
            return new TaskRequests.CompleteResult(TaskDto.from(t), null);
        }
        TaskDto next = completeInternal(t, zone);
        return new TaskRequests.CompleteResult(TaskDto.from(t), next);
    }

    @Transactional
    public Task reopen(UUID userId, UUID id) {
        Task t = get(userId, id);
        if (t.reopen()) {
            tasks.saveAndFlush(t);
            publish(t, EventTypes.TASK_REOPENED);
        }
        return t;
    }

    @Transactional
    public void delete(UUID userId, UUID id) {
        Task t = get(userId, id);
        for (Task sub : tasks.findByParentId(t.getId())) {
            outbox.publish(userId, EventTypes.TASK, sub.getId(), EventTypes.TASK_DELETED,
                    Map.of("id", sub.getId().toString()), clock.instant());
        }
        outbox.publish(userId, EventTypes.TASK, t.getId(), EventTypes.TASK_DELETED,
                Map.of("id", t.getId().toString()), clock.instant());
        tasks.delete(t); // subtasks go via ON DELETE CASCADE
    }

    private TaskDto completeInternal(Task t, ZoneId zone) {
        Instant now = clock.instant();
        t.complete(now);
        tasks.saveAndFlush(t);
        publish(t, EventTypes.TASK_COMPLETED);

        if (t.getRecurrence() == null || t.getDueAt() == null || t.isRecurrenceSpawned()) {
            return null;
        }
        Task next = new Task(t.getUserId(), t.getTitle());
        next.setDescription(t.getDescription());
        next.setPriority(t.getPriority());
        next.setTags(t.getTags().clone());
        next.setEstimateMinutes(t.getEstimateMinutes());
        next.setProjectId(t.getProjectId());
        next.setGoalId(t.getGoalId());
        next.setRecurrence(t.getRecurrence());
        next.setDueAt(RecurrenceCalculator.next(t.getRecurrence(), t.getDueAt(), now, zone));
        next.setPosition(tasks.maxPosition(t.getUserId(), Status.TODO) + 1000);
        tasks.save(next);
        t.setRecurrenceSpawned(true);
        publish(next, EventTypes.TASK_CREATED);
        return TaskDto.from(next);
    }

    private void publish(Task t, String type) {
        Instant at = switch (type) {
            case EventTypes.TASK_COMPLETED -> t.getCompletedAt();
            default -> clock.instant();
        };
        outbox.publish(t.getUserId(), EventTypes.TASK, t.getId(), type, TaskEvents.snapshot(t), at);
    }

    private UUID checkProject(UUID userId, UUID projectId) {
        if (projectId != null && !projects.existsByIdAndUserId(projectId, userId)) {
            throw ApiException.badRequest("UNKNOWN_PROJECT", "Project not found");
        }
        return projectId;
    }

    private UUID checkGoal(UUID userId, UUID goalId) {
        if (goalId != null && !goals.existsByIdAndUserId(goalId, userId)) {
            throw ApiException.badRequest("UNKNOWN_GOAL", "Goal not found");
        }
        return goalId;
    }

    private UUID checkParent(UUID userId, UUID parentId, UUID selfId) {
        if (parentId == null) {
            return null;
        }
        Task parent = tasks.findByIdAndUserId(parentId, userId)
                .orElseThrow(() -> ApiException.badRequest("UNKNOWN_PARENT", "Parent task not found"));
        if (parent.getParentId() != null || parentId.equals(selfId)) {
            throw ApiException.badRequest("INVALID_PARENT", "Subtasks can only be one level deep");
        }
        return parentId;
    }

    // ---- small, strict converters for merge-patch values ----

    private static String asString(Object o) {
        if (o == null) {
            return null;
        }
        if (!(o instanceof String s)) {
            throw ApiException.badRequest("VALIDATION_FAILED", "expected a string");
        }
        return s;
    }

    private static Integer asInteger(Object o, String field) {
        if (o == null) {
            return null;
        }
        if (o instanceof Number n && n.doubleValue() == Math.rint(n.doubleValue())) {
            return n.intValue();
        }
        throw ApiException.badRequest("VALIDATION_FAILED", field + " must be a whole number");
    }

    private static <E extends Enum<E>> E parseEnum(Class<E> type, Object o, String field, boolean nullable) {
        if (o == null) {
            if (nullable) {
                return null;
            }
            throw ApiException.badRequest("VALIDATION_FAILED", field + " is required");
        }
        try {
            return Enum.valueOf(type, o.toString().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("VALIDATION_FAILED", "invalid " + field);
        }
    }

    private static Instant parseInstant(Object o) {
        if (o == null) {
            return null;
        }
        try {
            return Instant.parse(o.toString());
        } catch (DateTimeParseException e) {
            throw ApiException.badRequest("VALIDATION_FAILED", "dueAt must be an ISO-8601 instant");
        }
    }

    private static UUID parseUuid(Object o, String field) {
        if (o == null) {
            return null;
        }
        try {
            return UUID.fromString(o.toString());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("VALIDATION_FAILED", "invalid " + field);
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
