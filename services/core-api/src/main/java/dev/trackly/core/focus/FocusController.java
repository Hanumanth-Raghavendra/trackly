package dev.trackly.core.focus;

import dev.trackly.core.common.ApiException;
import dev.trackly.core.outbox.EventTypes;
import dev.trackly.core.outbox.OutboxPublisher;
import dev.trackly.core.security.AuthUser;
import dev.trackly.core.task.TaskRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/focus/sessions")
@Tag(name = "Focus")
public class FocusController {

    public record FocusDto(UUID id, UUID taskId, Instant startedAt, Instant endedAt, int plannedMinutes,
                           int actualSeconds, boolean completed, String note) {
        static FocusDto from(FocusSession s) {
            return new FocusDto(s.getId(), s.getTaskId(), s.getStartedAt(), s.getEndedAt(), s.getPlannedMinutes(),
                    s.getActualSeconds(), s.isCompleted(), s.getNote());
        }
    }

    public record RecordSession(UUID taskId, @NotNull Instant startedAt, @NotNull Instant endedAt,
                                @Min(1) @Max(240) int plannedMinutes, boolean completed,
                                @Size(max = 500) String note) {}

    private final FocusSessionRepository sessions;
    private final TaskRepository tasks;
    private final OutboxPublisher outbox;
    private final Clock clock;

    public FocusController(FocusSessionRepository sessions, TaskRepository tasks, OutboxPublisher outbox, Clock clock) {
        this.sessions = sessions;
        this.tasks = tasks;
        this.outbox = outbox;
        this.clock = clock;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<FocusDto> list(@AuthenticationPrincipal AuthUser me,
                               @RequestParam(required = false) Instant from,
                               @RequestParam(required = false) Instant to) {
        Instant end = to == null ? clock.instant().plus(Duration.ofDays(1)) : to;
        Instant start = from == null ? end.minus(Duration.ofDays(30)) : from;
        return sessions.findByUserIdAndStartedAtBetweenOrderByStartedAtDesc(me.id(), start, end).stream()
                .map(FocusDto::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    @Operation(summary = "Record a finished or abandoned focus session")
    public FocusDto record(@AuthenticationPrincipal AuthUser me, @Valid @RequestBody RecordSession req) {
        if (req.endedAt().isBefore(req.startedAt())) {
            throw ApiException.badRequest("VALIDATION_FAILED", "endedAt must be after startedAt");
        }
        if (req.endedAt().isAfter(clock.instant().plus(Duration.ofMinutes(5)))) {
            throw ApiException.badRequest("VALIDATION_FAILED", "Session can't end in the future");
        }
        long seconds = Duration.between(req.startedAt(), req.endedAt()).toSeconds();
        if (seconds > 4 * 3600) {
            throw ApiException.badRequest("VALIDATION_FAILED", "Sessions are capped at 4 hours");
        }
        if (req.taskId() != null && tasks.findByIdAndUserId(req.taskId(), me.id()).isEmpty()) {
            throw ApiException.badRequest("UNKNOWN_TASK", "Task not found");
        }
        FocusSession s = new FocusSession(me.id(), req.taskId(), req.startedAt(), req.endedAt(), req.plannedMinutes(),
                (int) seconds, req.completed(), req.note() == null || req.note().isBlank() ? null : req.note().trim());
        sessions.save(s);
        outbox.publish(me.id(), EventTypes.FOCUS, s.getId(), EventTypes.FOCUS_SESSION_RECORDED, snapshot(s),
                s.getEndedAt());
        return FocusDto.from(s);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id) {
        FocusSession s = sessions.findByIdAndUserId(id, me.id()).orElseThrow(() -> ApiException.notFound("Session"));
        outbox.publish(me.id(), EventTypes.FOCUS, id, EventTypes.FOCUS_SESSION_DELETED, Map.of("id", id.toString()),
                clock.instant());
        sessions.delete(s);
        return ResponseEntity.noContent().build();
    }

    public static Map<String, Object> snapshot(FocusSession s) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("id", s.getId().toString());
        p.put("taskId", s.getTaskId() == null ? null : s.getTaskId().toString());
        p.put("startedAt", s.getStartedAt().toString());
        p.put("endedAt", s.getEndedAt().toString());
        p.put("plannedMinutes", s.getPlannedMinutes());
        p.put("actualSeconds", s.getActualSeconds());
        p.put("completed", s.isCompleted());
        return p;
    }
}
