package dev.trackly.core.habit;

import dev.trackly.core.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "habit_checkins")
public class HabitCheckin extends BaseEntity {

    @Column(name = "habit_id", nullable = false, updatable = false)
    private UUID habitId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    /** The user's local calendar day this check-in counts for. */
    @Column(nullable = false, updatable = false)
    private LocalDate day;

    private String note;

    private Short mood;

    @Column(name = "is_freeze", nullable = false)
    private boolean freeze;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected HabitCheckin() {}

    public HabitCheckin(UUID habitId, UUID userId, LocalDate day) {
        this.habitId = habitId;
        this.userId = userId;
        this.day = day;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public UUID getHabitId() { return habitId; }
    public UUID getUserId() { return userId; }
    public LocalDate getDay() { return day; }
    public String getNote() { return note; }
    public Short getMood() { return mood; }
    public boolean isFreeze() { return freeze; }
    public Instant getCreatedAt() { return createdAt; }

    public void setNote(String note) { this.note = note; }
    public void setMood(Short mood) { this.mood = mood; }
    public void setFreeze(boolean freeze) { this.freeze = freeze; }
}
