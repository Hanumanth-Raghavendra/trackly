package dev.trackly.core.task;

public final class TaskEnums {

    private TaskEnums() {}

    public enum Status { TODO, IN_PROGRESS, DONE }

    public enum Priority { LOW, MEDIUM, HIGH, URGENT }

    public enum Recurrence { DAILY, WEEKDAYS, WEEKLY, MONTHLY }
}
