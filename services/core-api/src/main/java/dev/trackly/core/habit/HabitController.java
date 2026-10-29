package dev.trackly.core.habit;

import dev.trackly.core.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/habits")
@Tag(name = "Habits")
public class HabitController {

    private final HabitService habitService;

    public HabitController(HabitService habitService) {
        this.habitService = habitService;
    }

    @GetMapping
    @Operation(summary = "List habits with streaks and 30-day consistency")
    public List<HabitDtos.HabitDto> list(@AuthenticationPrincipal AuthUser me,
                                         @RequestParam(defaultValue = "false") boolean includeArchived) {
        return habitService.list(me.id(), me.zone(), includeArchived);
    }

    @GetMapping("/checkins")
    @Operation(summary = "All check-ins in a date range (for heatmaps)")
    public List<HabitDtos.CheckinDto> checkins(
            @AuthenticationPrincipal AuthUser me,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return habitService.checkins(me.id(), from, to);
    }

    @GetMapping("/{id}")
    public HabitDtos.HabitDto get(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id) {
        return habitService.get(me.id(), me.zone(), id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public HabitDtos.HabitDto create(@AuthenticationPrincipal AuthUser me,
                                     @Valid @RequestBody HabitDtos.CreateHabit req) {
        return habitService.create(me.id(), me.zone(), req);
    }

    @PatchMapping("/{id}")
    public HabitDtos.HabitDto update(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id,
                                     @Valid @RequestBody HabitDtos.UpdateHabit req) {
        return habitService.update(me.id(), me.zone(), id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id) {
        habitService.delete(me.id(), id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}/checkins/{day}")
    @Operation(summary = "Check in for a day (idempotent)")
    public HabitDtos.HabitDto checkIn(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id,
                                      @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day,
                                      @Valid @RequestBody(required = false) HabitDtos.CheckinRequest req) {
        return habitService.checkIn(me.id(), me.zone(), id, day, req);
    }

    @DeleteMapping("/{id}/checkins/{day}")
    @Operation(summary = "Undo a check-in")
    public HabitDtos.HabitDto uncheck(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id,
                                      @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day) {
        return habitService.uncheck(me.id(), me.zone(), id, day);
    }

    @PostMapping("/{id}/freeze/{day}")
    @Operation(summary = "Spend a streak freeze on a missed day in the last week")
    public HabitDtos.HabitDto freeze(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id,
                                     @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day) {
        return habitService.freeze(me.id(), me.zone(), id, day);
    }
}
