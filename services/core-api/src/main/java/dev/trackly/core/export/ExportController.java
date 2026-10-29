package dev.trackly.core.export;

import dev.trackly.core.focus.FocusController;
import dev.trackly.core.focus.FocusSessionRepository;
import dev.trackly.core.goal.GoalService;
import dev.trackly.core.habit.HabitService;
import dev.trackly.core.project.ProjectRepository;
import dev.trackly.core.security.AuthUser;
import dev.trackly.core.task.TaskDto;
import dev.trackly.core.task.TaskService;
import dev.trackly.core.user.UserDto;
import dev.trackly.core.user.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** "Download my data": everything the user owns as one JSON document (data portability). */
@RestController
@RequestMapping("/api/v1/export")
@Tag(name = "Account")
public class ExportController {

    private final UserService userService;
    private final TaskService taskService;
    private final HabitService habitService;
    private final GoalService goalService;
    private final ProjectRepository projects;
    private final FocusSessionRepository focus;
    private final Clock clock;

    public ExportController(UserService userService, TaskService taskService, HabitService habitService,
                            GoalService goalService, ProjectRepository projects, FocusSessionRepository focus,
                            Clock clock) {
        this.userService = userService;
        this.taskService = taskService;
        this.habitService = habitService;
        this.goalService = goalService;
        this.projects = projects;
        this.focus = focus;
        this.clock = clock;
    }

    @GetMapping
    @Transactional(readOnly = true)
    @Operation(summary = "Export all of the user's data as JSON")
    public ResponseEntity<Map<String, Object>> export(@AuthenticationPrincipal AuthUser me) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("exportedAt", clock.instant().toString());
        out.put("format", "trackly-export/v1");
        out.put("user", UserDto.from(userService.get(me.id())));
        out.put("projects", projects.findByUserIdOrderByCreatedAtAsc(me.id()).stream()
                .map(p -> Map.of("id", p.getId(), "name", p.getName(), "color", p.getColor())).toList());
        out.put("goals", goalService.list(me.id(), me.zone()));
        List<TaskDto> tasks = taskService.list(me.id(), new TaskService.Filter(null, null, null, null, null, null, true))
                .stream().map(TaskDto::from).toList();
        out.put("tasks", tasks);
        out.put("habits", habitService.list(me.id(), me.zone(), true));
        out.put("habitCheckins", habitService.checkins(me.id(), LocalDate.now(clock).minusDays(400), LocalDate.now(clock)));
        out.put("focusSessions", focus.findByUserIdAndStartedAtBetweenOrderByStartedAtDesc(
                me.id(), Instant.EPOCH, clock.instant().plusSeconds(86400)).stream().map(s -> FocusController.snapshot(s)).toList());
        String filename = "trackly-export-" + LocalDate.now(clock) + ".json";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(out);
    }
}
