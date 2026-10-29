package dev.trackly.core.outbox;

/**
 * Event contract shared with the insights service. Payloads carry a full snapshot of the
 * aggregate ("event-carried state transfer"), so consumers can upsert idempotently.
 * See docs/EVENTS.md for the payload of each type.
 */
public final class EventTypes {

    private EventTypes() {}

    public static final String USER = "USER";
    public static final String TASK = "TASK";
    public static final String HABIT = "HABIT";
    public static final String FOCUS = "FOCUS";
    public static final String GOAL = "GOAL";

    public static final String USER_REGISTERED = "USER_REGISTERED";
    public static final String USER_UPDATED = "USER_UPDATED";
    public static final String USER_DELETED = "USER_DELETED";

    public static final String TASK_CREATED = "TASK_CREATED";
    public static final String TASK_UPDATED = "TASK_UPDATED";
    public static final String TASK_COMPLETED = "TASK_COMPLETED";
    public static final String TASK_REOPENED = "TASK_REOPENED";
    public static final String TASK_DELETED = "TASK_DELETED";

    public static final String HABIT_CREATED = "HABIT_CREATED";
    public static final String HABIT_UPDATED = "HABIT_UPDATED";
    public static final String HABIT_DELETED = "HABIT_DELETED";
    public static final String HABIT_CHECKED = "HABIT_CHECKED";
    public static final String HABIT_UNCHECKED = "HABIT_UNCHECKED";

    public static final String FOCUS_SESSION_RECORDED = "FOCUS_SESSION_RECORDED";
    public static final String FOCUS_SESSION_DELETED = "FOCUS_SESSION_DELETED";

    public static final String GOAL_CREATED = "GOAL_CREATED";
    public static final String GOAL_UPDATED = "GOAL_UPDATED";
    public static final String GOAL_COMPLETED = "GOAL_COMPLETED";
    public static final String GOAL_DELETED = "GOAL_DELETED";
}
