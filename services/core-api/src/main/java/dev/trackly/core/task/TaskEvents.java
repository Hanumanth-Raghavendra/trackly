package dev.trackly.core.task;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/** Outbox payload for task events: a full snapshot so consumers can upsert. */
public final class TaskEvents {

    private TaskEvents() {}

    public static Map<String, Object> snapshot(Task t) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("id", t.getId().toString());
        p.put("title", t.getTitle());
        p.put("status", t.getStatus().name());
        p.put("priority", t.getPriority().name());
        p.put("tags", Arrays.asList(t.getTags()));
        p.put("projectId", str(t.getProjectId()));
        p.put("goalId", str(t.getGoalId()));
        p.put("parentId", str(t.getParentId()));
        p.put("dueAt", str(t.getDueAt()));
        p.put("estimateMinutes", t.getEstimateMinutes());
        p.put("recurrence", t.getRecurrence() == null ? null : t.getRecurrence().name());
        p.put("createdAt", str(t.getCreatedAt()));
        p.put("completedAt", str(t.getCompletedAt()));
        return p;
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
