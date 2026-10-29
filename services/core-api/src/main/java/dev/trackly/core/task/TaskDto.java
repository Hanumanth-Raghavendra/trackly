package dev.trackly.core.task;

import dev.trackly.core.task.TaskEnums.Priority;
import dev.trackly.core.task.TaskEnums.Recurrence;
import dev.trackly.core.task.TaskEnums.Status;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record TaskDto(
        UUID id,
        String title,
        String description,
        Status status,
        Priority priority,
        List<String> tags,
        Instant dueAt,
        Integer estimateMinutes,
        double position,
        Recurrence recurrence,
        UUID projectId,
        UUID goalId,
        UUID parentId,
        Instant completedAt,
        Instant createdAt,
        Instant updatedAt) {

    public static TaskDto from(Task t) {
        return new TaskDto(t.getId(), t.getTitle(), t.getDescription(), t.getStatus(), t.getPriority(),
                List.of(t.getTags()), t.getDueAt(), t.getEstimateMinutes(), t.getPosition(), t.getRecurrence(),
                t.getProjectId(), t.getGoalId(), t.getParentId(), t.getCompletedAt(), t.getCreatedAt(),
                t.getUpdatedAt());
    }
}
