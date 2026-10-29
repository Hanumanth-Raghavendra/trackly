package dev.trackly.core.task;

import dev.trackly.core.task.TaskEnums.Priority;
import dev.trackly.core.task.TaskEnums.Recurrence;
import dev.trackly.core.task.TaskEnums.Status;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class TaskRequests {

    private TaskRequests() {}

    public record CreateTask(
            @NotBlank @Size(max = 200) String title,
            @Size(max = 5000) String description,
            Status status,
            Priority priority,
            @Size(max = 10) List<String> tags,
            Instant dueAt,
            @Min(1) @Max(1440) Integer estimateMinutes,
            Recurrence recurrence,
            UUID projectId,
            UUID goalId,
            UUID parentId) {}

    public record CompleteResult(TaskDto task, TaskDto nextOccurrence) {}
}
