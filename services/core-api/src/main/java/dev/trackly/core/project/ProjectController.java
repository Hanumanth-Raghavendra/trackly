package dev.trackly.core.project;

import dev.trackly.core.common.ApiException;
import dev.trackly.core.common.Colors;
import dev.trackly.core.security.AuthUser;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Projects are simple task groupings; small enough that the controller talks to the repository. */
@RestController
@RequestMapping("/api/v1/projects")
@Tag(name = "Projects")
public class ProjectController {

    public record ProjectDto(UUID id, String name, String color, boolean archived, Instant createdAt) {
        static ProjectDto from(Project p) {
            return new ProjectDto(p.getId(), p.getName(), p.getColor(), p.isArchived(), p.getCreatedAt());
        }
    }

    public record CreateProject(@NotBlank @Size(max = 60) String name, @Size(max = 16) String color) {}

    public record UpdateProject(@Size(min = 1, max = 60) String name, @Size(max = 16) String color, Boolean archived) {}

    private final ProjectRepository projects;

    public ProjectController(ProjectRepository projects) {
        this.projects = projects;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<ProjectDto> list(@AuthenticationPrincipal AuthUser me) {
        return projects.findByUserIdOrderByCreatedAtAsc(me.id()).stream().map(ProjectDto::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public ProjectDto create(@AuthenticationPrincipal AuthUser me, @Valid @RequestBody CreateProject req) {
        Project p = new Project(me.id(), req.name().trim(), Colors.orDefault(req.color(), "#6366f1"));
        return ProjectDto.from(projects.save(p));
    }

    @PatchMapping("/{id}")
    @Transactional
    public ProjectDto update(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id,
                             @Valid @RequestBody UpdateProject req) {
        Project p = projects.findByIdAndUserId(id, me.id()).orElseThrow(() -> ApiException.notFound("Project"));
        if (req.name() != null) {
            p.setName(req.name().trim());
        }
        if (req.color() != null) {
            p.setColor(Colors.orDefault(req.color(), p.getColor()));
        }
        if (req.archived() != null) {
            p.setArchived(req.archived());
        }
        return ProjectDto.from(p);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthUser me, @PathVariable UUID id) {
        Project p = projects.findByIdAndUserId(id, me.id()).orElseThrow(() -> ApiException.notFound("Project"));
        projects.delete(p); // tasks keep existing; FK sets project_id to NULL
        return ResponseEntity.noContent().build();
    }
}
