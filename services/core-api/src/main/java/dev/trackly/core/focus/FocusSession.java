package dev.trackly.core.focus;

import dev.trackly.core.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * A finished (or abandoned) Pomodoro-style focus session. The timer runs on the client, which
 * records the session when it ends — so focus mode keeps working offline and on flaky networks.
 */
@Entity
@Table(name = "focus_sessions")
public class FocusSession extends BaseEntity {

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "task_id")
    private UUID taskId;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "ended_at", nullable = false)
    private Instant endedAt;

    @Column(name = "planned_minutes", nullable = false)
    private int plannedMinutes;

    @Column(name = "actual_seconds", nullable = false)
    private int actualSeconds;

    @Column(nullable = false)
    private boolean completed;

    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected FocusSession() {}

    public FocusSession(UUID userId, UUID taskId, Instant startedAt, Instant endedAt, int plannedMinutes,
                        int actualSeconds, boolean completed, String note) {
        this.userId = userId;
        this.taskId = taskId;
        this.startedAt = startedAt;
        this.endedAt = endedAt;
        this.plannedMinutes = plannedMinutes;
        this.actualSeconds = actualSeconds;
        this.completed = completed;
        this.note = note;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public UUID getUserId() { return userId; }
    public UUID getTaskId() { return taskId; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getEndedAt() { return endedAt; }
    public int getPlannedMinutes() { return plannedMinutes; }
    public int getActualSeconds() { return actualSeconds; }
    public boolean isCompleted() { return completed; }
    public String getNote() { return note; }
    public Instant getCreatedAt() { return createdAt; }
}
