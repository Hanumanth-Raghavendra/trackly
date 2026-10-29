package dev.trackly.core.goal;

import dev.trackly.core.security.AuthUser;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/goals")
@Tag(name = "Goals")
public class GoalController {

    private final GoalService goalService;

    public GoalController(GoalService goalService) {
        this.goalService = goalService;
    }

    @GetMapping
    public List<GoalService.GoalDto> list(@AuthenticationPrincipal AuthUser me) {
        return goalService.list(me.id(), me.zone());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GoalService.GoalDto create(@AuthenticationPrincipal AuthUser me,
                                      @Valid @RequestBody GoalService.CreateGoal req) {
        return goalService.create(me.id(), me.zone(), req);
    }

    @PatchMapping("/{id}")
    public GoalService.GoalDto update(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id,
                                      @Valid @RequestBody GoalService.UpdateGoal req) {
        return goalService.update(me.id(), me.zone(), id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id) {
        goalService.delete(me.id(), id);
        return ResponseEntity.noContent().build();
    }
}
