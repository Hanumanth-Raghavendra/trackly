package dev.trackly.core.task;

import dev.trackly.core.security.AuthUser;
import dev.trackly.core.task.TaskEnums.Status;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tasks")
@Tag(name = "Tasks")
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @GetMapping
    @Operation(summary = "List tasks (flat, subtasks included; use parentId to nest)")
    public List<TaskDto> list(@AuthenticationPrincipal AuthUser me,
                              @RequestParam(required = false) Status status,
                              @RequestParam(required = false) UUID projectId,
                              @RequestParam(required = false) UUID goalId,
                              @RequestParam(required = false, name = "q") String query,
                              @RequestParam(required = false) Instant dueFrom,
                              @RequestParam(required = false) Instant dueTo,
                              @RequestParam(defaultValue = "true") boolean includeDone) {
        var filter = new TaskService.Filter(status, projectId, goalId, query, dueFrom, dueTo, includeDone);
        return taskService.list(me.id(), filter).stream().map(TaskDto::from).toList();
    }

    @GetMapping("/{id}")
    public TaskDto get(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id) {
        return TaskDto.from(taskService.get(me.id(), id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a task or subtask")
    public TaskDto create(@AuthenticationPrincipal AuthUser me, @Valid @RequestBody TaskRequests.CreateTask req) {
        return TaskDto.from(taskService.create(me.id(), req));
    }

    @PatchMapping("/{id}")
    @Operation(summary = "Partially update a task (JSON Merge Patch: null clears a field)")
    public TaskRequests.CompleteResult patch(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id,
                                             @RequestBody Map<String, Object> body) {
        return taskService.patch(me.id(), me.zone(), id, body);
    }

    @PostMapping("/{id}/complete")
    @Operation(summary = "Complete a task; recurring tasks schedule their next occurrence")
    public TaskRequests.CompleteResult complete(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id) {
        return taskService.complete(me.id(), me.zone(), id);
    }

    @PostMapping("/{id}/reopen")
    public TaskDto reopen(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id) {
        return TaskDto.from(taskService.reopen(me.id(), id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id) {
        taskService.delete(me.id(), id);
        return ResponseEntity.noContent().build();
    }
}
