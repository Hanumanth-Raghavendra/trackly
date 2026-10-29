package dev.trackly.core.habit;

import dev.trackly.core.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "habits")
public class Habit extends BaseEntity {

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "goal_id")
    private UUID goalId;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(nullable = false)
    private String icon;

    @Column(nullable = false)
    private String color;

    @Enumerated(EnumType.STRING)
    @Column(name = "frequency_type", nullable = false)
    private HabitSchedule.Frequency frequencyType = HabitSchedule.Frequency.DAILY;

    @Column(name = "target_per_week", nullable = false)
    private int targetPerWeek = 7;

    /** Bitmask of scheduled weekdays: Monday = 1, Tuesday = 2, ... Sunday = 64. */
    @Column(name = "days_of_week", nullable = false)
    private int daysOfWeek = HabitSchedule.ALL_DAYS;

    @Column(name = "reminder_time")
    private LocalTime reminderTime;

    @Column(name = "freeze_tokens", nullable = false)
    private int freezeTokens = 1;

    @Column(nullable = false)
    private boolean archived;

    @Column(nullable = false)
    private int position;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Habit() {}

    public Habit(UUID userId, String name) {
        this.userId = userId;
        this.name = name;
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

    public HabitSchedule schedule() {
        return new HabitSchedule(frequencyType, targetPerWeek, daysOfWeek);
    }

    public UUID getUserId() { return userId; }
    public UUID getGoalId() { return goalId; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public String getIcon() { return icon; }
    public String getColor() { return color; }
    public HabitSchedule.Frequency getFrequencyType() { return frequencyType; }
    public int getTargetPerWeek() { return targetPerWeek; }
    public int getDaysOfWeek() { return daysOfWeek; }
    public LocalTime getReminderTime() { return reminderTime; }
    public int getFreezeTokens() { return freezeTokens; }
    public boolean isArchived() { return archived; }
    public int getPosition() { return position; }
    public Instant getCreatedAt() { return createdAt; }

    public void setGoalId(UUID goalId) { this.goalId = goalId; }
    public void setName(String name) { this.name = name; }
    public void setDescription(String description) { this.description = description; }
    public void setIcon(String icon) { this.icon = icon; }
    public void setColor(String color) { this.color = color; }
    public void setFrequencyType(HabitSchedule.Frequency frequencyType) { this.frequencyType = frequencyType; }
    public void setTargetPerWeek(int targetPerWeek) { this.targetPerWeek = targetPerWeek; }
    public void setDaysOfWeek(int daysOfWeek) { this.daysOfWeek = daysOfWeek; }
    public void setReminderTime(LocalTime reminderTime) { this.reminderTime = reminderTime; }
    public void setFreezeTokens(int freezeTokens) { this.freezeTokens = freezeTokens; }
    public void setArchived(boolean archived) { this.archived = archived; }
    public void setPosition(int position) { this.position = position; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
