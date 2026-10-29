package dev.trackly.core.habit;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

public final class HabitEvents {

    private HabitEvents() {}

    public static Map<String, Object> snapshot(Habit h) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("id", h.getId().toString());
        p.put("name", h.getName());
        p.put("icon", h.getIcon());
        p.put("color", h.getColor());
        p.put("frequencyType", h.getFrequencyType().name());
        p.put("targetPerWeek", h.getTargetPerWeek());
        p.put("daysOfWeek", h.getDaysOfWeek());
        p.put("reminderTime", h.getReminderTime() == null ? null : h.getReminderTime().toString());
        p.put("goalId", h.getGoalId() == null ? null : h.getGoalId().toString());
        p.put("archived", h.isArchived());
        p.put("createdAt", h.getCreatedAt() == null ? null : h.getCreatedAt().toString());
        return p;
    }

    public static Map<String, Object> checkin(HabitCheckin c, Instant checkedAt) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("habitId", c.getHabitId().toString());
        p.put("date", c.getDay().toString());
        p.put("mood", c.getMood());
        p.put("freeze", c.isFreeze());
        p.put("checkedAt", checkedAt.toString());
        return p;
    }
}
