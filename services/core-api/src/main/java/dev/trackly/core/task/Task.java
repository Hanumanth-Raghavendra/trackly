package dev.trackly.core.task;

import dev.trackly.core.common.BaseEntity;
import dev.trackly.core.task.TaskEnums.Priority;
import dev.trackly.core.task.TaskEnums.Recurrence;
import dev.trackly.core.task.TaskEnums.Status;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "tasks")
public class Task extends BaseEntity {

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "project_id")
    private UUID projectId;

    @Column(name = "goal_id")
    private UUID goalId;

    @Column(name = "parent_id")
    private UUID parentId;

    @Column(nullable = false)
    private String title;

    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.TODO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Priority priority = Priority.MEDIUM;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]", nullable = false)
    private String[] tags = new String[0];

    @Column(name = "due_at")
    private Instant dueAt;

    @Column(name = "estimate_minutes")
    private Integer estimateMinutes;

    @Column(nullable = false)
    private double position;

    @Enumerated(EnumType.STRING)
    private Recurrence recurrence;

    @Column(name = "recurrence_spawned", nullable = false)
    private boolean recurrenceSpawned;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Task() {}

    public Task(UUID userId, String title) {
        this.userId = userId;
        this.title = title;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    /** Marks the task done. Returns false if it already was. */
    public boolean complete(Instant at) {
        if (status == Status.DONE) {
            return false;
        }
        status = Status.DONE;
        completedAt = at;
        return true;
    }

    /** Moves a done task back to TODO. Returns false if it wasn't done. */
    public boolean reopen() {
        if (status != Status.DONE) {
            return false;
        }
        status = Status.TODO;
        completedAt = null;
        return true;
    }

    public UUID getUserId() { return userId; }
    public UUID getProjectId() { return projectId; }
    public UUID getGoalId() { return goalId; }
    public UUID getParentId() { return parentId; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public Status getStatus() { return status; }
    public Priority getPriority() { return priority; }
    public String[] getTags() { return tags; }
    public Instant getDueAt() { return dueAt; }
    public Integer getEstimateMinutes() { return estimateMinutes; }
    public double getPosition() { return position; }
    public Recurrence getRecurrence() { return recurrence; }
    public boolean isRecurrenceSpawned() { return recurrenceSpawned; }
    public Instant getCompletedAt() { return completedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void setProjectId(UUID projectId) { this.projectId = projectId; }
    public void setGoalId(UUID goalId) { this.goalId = goalId; }
    public void setParentId(UUID parentId) { this.parentId = parentId; }
    public void setTitle(String title) { this.title = title; }
    public void setDescription(String description) { this.description = description; }
    public void setStatus(Status status) { this.status = status; }
    public void setPriority(Priority priority) { this.priority = priority; }
    public void setTags(String[] tags) { this.tags = tags == null ? new String[0] : tags; }
    public void setDueAt(Instant dueAt) { this.dueAt = dueAt; }
    public void setEstimateMinutes(Integer estimateMinutes) { this.estimateMinutes = estimateMinutes; }
    public void setPosition(double position) { this.position = position; }
    public void setRecurrence(Recurrence recurrence) { this.recurrence = recurrence; }
    public void setRecurrenceSpawned(boolean recurrenceSpawned) { this.recurrenceSpawned = recurrenceSpawned; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
