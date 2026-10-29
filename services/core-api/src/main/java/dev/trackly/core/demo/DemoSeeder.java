package dev.trackly.core.demo;

import dev.trackly.core.habit.HabitSchedule;
import dev.trackly.core.outbox.EventTypes;
import dev.trackly.core.outbox.OutboxPublisher;
import dev.trackly.core.user.User;
import dev.trackly.core.user.UserEvents;
import dev.trackly.core.user.UserRepository;
import java.sql.Array;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds a believable 8-week history for a throw-away demo account, so a recruiter clicking
 * "Try the demo" lands on full charts instead of an empty app.
 *
 * <p>The data has deliberate behavioural patterns for the insights engine to discover:
 * mornings and mid-afternoons are productive, Tuesdays/Thursdays are strong days, the workout
 * habit is usually skipped on Wednesdays, and some tasks finish after their due date.
 *
 * <p>Rows are written with JDBC batches (not JPA) because one demo is ~1,000 inserts, and every
 * row gets its outbox event so the insights service builds its read model the normal way.
 */
@Component
public class DemoSeeder {

    static final int HISTORY_DAYS = 56;
    static final int MAX_BACKLOG = 8;

    private record Template(String title, String project, String[] tags, String goal) {}

    private record HabitSpec(String name, String icon, String color, HabitSchedule.Frequency freq, int target,
                             List<DayOfWeek> days, double baseRate, String goal, LocalTime reminder) {}

    private static final List<Template> TEMPLATES = List.of(
            new Template("Review pull request #%d", "Work", new String[] {"code-review"}, null),
            new Template("Write unit tests for %s service", "Work", new String[] {"testing", "java"}, null),
            new Template("Fix pagination bug in %s API", "Work", new String[] {"bug"}, null),
            new Template("Prepare sprint demo slides", "Work", new String[] {"meeting"}, null),
            new Template("Update API docs for %s", "Work", new String[] {"docs"}, null),
            new Template("Refactor %s module", "Work", new String[] {"java", "refactor"}, null),
            new Template("Spring Security - chapter %d", "Learning", new String[] {"java", "spring"}, "Crack the Java interview"),
            new Template("Practice SQL joins (%d problems)", "Learning", new String[] {"sql"}, "Crack the Java interview"),
            new Template("Revise Collections framework", "Learning", new String[] {"java"}, "Crack the Java interview"),
            new Template("Mock interview: OOP concepts", "Learning", new String[] {"interview"}, "Crack the Java interview"),
            new Template("Read about JVM garbage collection", "Learning", new String[] {"java", "jvm"}, "Crack the Java interview"),
            new Template("Design habit heatmap component", "Side project", new String[] {"frontend", "react"}, "Ship portfolio v2"),
            new Template("Write README section: %s", "Side project", new String[] {"docs"}, "Ship portfolio v2"),
            new Template("Add dark mode polish", "Side project", new String[] {"frontend"}, "Ship portfolio v2"),
            new Template("Set up GitHub Actions for %s", "Side project", new String[] {"devops"}, "Ship portfolio v2"),
            new Template("Pay electricity bill", "Personal", new String[] {"bills"}, null),
            new Template("Buy groceries", "Personal", new String[] {"errands"}, null),
            new Template("Plan weekend trip", "Personal", new String[] {"family"}, null),
            new Template("Clean up desk and inbox", "Personal", new String[] {"chores"}, null),
            new Template("Interval run - %d km", "Personal", new String[] {"fitness"}, "Run a 10K"));

    private static final String[] MODULES = {"auth", "billing", "habits", "tasks", "analytics", "search"};

    private static final List<HabitSpec> HABITS = List.of(
            new HabitSpec("Morning workout", "🏋️", "#16a34a", HabitSchedule.Frequency.SPECIFIC_DAYS, 4,
                    List.of(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY),
                    0.82, "Run a 10K", LocalTime.of(6, 30)),
            new HabitSpec("Read 20 pages", "📚", "#7c3aed", HabitSchedule.Frequency.DAILY, 7, null, 0.8, null,
                    LocalTime.of(21, 30)),
            new HabitSpec("Solve one LeetCode problem", "💻", "#0891b2", HabitSchedule.Frequency.DAILY, 7, null, 0.72,
                    "Crack the Java interview", null),
            new HabitSpec("Meditate 10 minutes", "🧘", "#0d9488", HabitSchedule.Frequency.DAILY, 7, null, 0.66, null,
                    LocalTime.of(7, 0)),
            new HabitSpec("Drink 3L of water", "💧", "#4361ee", HabitSchedule.Frequency.DAILY, 7, null, 0.86, null,
                    null),
            new HabitSpec("Call family", "📞", "#ea580c", HabitSchedule.Frequency.WEEKLY_TIMES, 2, null, 0.35, null,
                    null));

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JdbcTemplate jdbc;
    private final OutboxPublisher outbox;
    private final Clock clock;

    public DemoSeeder(UserRepository users, PasswordEncoder passwordEncoder, JdbcTemplate jdbc, OutboxPublisher outbox,
                      Clock clock) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jdbc = jdbc;
        this.outbox = outbox;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public User createDemoUser(String timezone) {
        Random rnd = new Random();
        String suffix = HexFormat.of().formatHex(UUID.randomUUID().toString().getBytes(), 0, 4);
        User user = new User("demo-" + suffix + "@demo.trackly.app",
                passwordEncoder.encode(UUID.randomUUID().toString()), "Demo Explorer", timezone);
        user.setDemo(true);
        users.saveAndFlush(user);

        List<OutboxPublisher.Event> events = new ArrayList<>();
        events.add(event(user.getId(), EventTypes.USER, user.getId(), EventTypes.USER_REGISTERED,
                UserEvents.snapshot(user), clock.instant().minus(Duration.ofDays(HISTORY_DAYS + 1))));
        new Builder(user.getId(), ZoneId.of(timezone), rnd, events).build();

        events.sort(Comparator.comparing(OutboxPublisher.Event::occurredAt));
        outbox.publishAll(events);
        return user;
    }

    private static OutboxPublisher.Event event(UUID userId, String aggType, UUID aggId, String type,
                                               Map<String, Object> payload, Instant at) {
        return new OutboxPublisher.Event(userId, aggType, aggId, type, payload, at);
    }

    /** Holds the per-seed state so the generation code reads top to bottom. */
    private final class Builder {

        private final UUID userId;
        private final ZoneId zone;
        private final Random rnd;
        private final List<OutboxPublisher.Event> events;
        private final LocalDate today;
        private final Instant now;
        private final Map<String, UUID> projects = new LinkedHashMap<>();
        private final Map<String, UUID> goals = new LinkedHashMap<>();
        private final List<Object[]> taskRows = new ArrayList<>();
        private final List<UUID> recentDoneTaskIds = new ArrayList<>();
        private double position = 1000;

        Builder(UUID userId, ZoneId zone, Random rnd, List<OutboxPublisher.Event> events) {
            this.userId = userId;
            this.zone = zone;
            this.rnd = rnd;
            this.events = events;
            this.now = clock.instant();
            this.today = LocalDate.now(clock.withZone(zone));
        }

        void build() {
            seedProjects();
            seedGoals();
            seedHistoryTasks();
            seedCurrentTasks();
            insertTasks();
            seedHabits();
            seedFocus();
        }

        private Instant at(LocalDate day, int hour, int minute) {
            return ZonedDateTime.of(day, LocalTime.of(hour, minute), zone).toInstant();
        }

        private void seedProjects() {
            String[][] defs = {{"Work", "#4361ee"}, {"Learning", "#0d9488"}, {"Side project", "#b7791f"},
                {"Personal", "#db2777"}};
            Instant created = at(today.minusDays(HISTORY_DAYS), 9, 0);
            for (String[] d : defs) {
                UUID id = UUID.randomUUID();
                projects.put(d[0], id);
                jdbc.update("INSERT INTO core.projects (id, user_id, name, color, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?)", id, userId, d[0], d[1], ts(created), ts(created));
            }
        }

        private void seedGoals() {
            Object[][] defs = {
                {"Ship portfolio v2", "Finish Trackly and publish it with a live demo", "#b7791f", 21},
                {"Crack the Java interview", "Core Java, Spring Boot and SQL - interview ready", "#4361ee", 45},
                {"Run a 10K", "Build up from 3K to a 10K run", "#16a34a", 60},
            };
            Instant created = at(today.minusDays(HISTORY_DAYS), 9, 30);
            for (Object[] d : defs) {
                UUID id = UUID.randomUUID();
                goals.put((String) d[0], id);
                LocalDate target = today.plusDays((Integer) d[3]);
                jdbc.update("INSERT INTO core.goals (id, user_id, title, description, color, target_date, status, "
                                + "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)",
                        id, userId, d[0], d[1], d[2], target, ts(created), ts(created));
                Map<String, Object> p = new LinkedHashMap<>();
                p.put("id", id.toString());
                p.put("title", d[0]);
                p.put("status", "ACTIVE");
                p.put("targetDate", target.toString());
                p.put("completedAt", null);
                events.add(event(userId, EventTypes.GOAL, id, EventTypes.GOAL_CREATED, p, created));
            }
        }

        /** Past tasks with realistic completion behaviour. */
        private void seedHistoryTasks() {
            // Keep the leftover backlog small and free of duplicate titles, like a real list.
            Set<String> backlog = new HashSet<>();
            for (int offset = HISTORY_DAYS; offset >= 1; offset--) {
                LocalDate day = today.minusDays(offset);
                boolean weekend = day.getDayOfWeek().getValue() >= 6;
                int count = weekend ? 1 + rnd.nextInt(3) : 4 + rnd.nextInt(4);
                for (int i = 0; i < count; i++) {
                    Template t = pick(weekend);
                    String title = fill(t.title());
                    Instant created = at(day, 8 + rnd.nextInt(10), rnd.nextInt(60));
                    Instant due = rnd.nextDouble() < 0.65 ? at(day.plusDays(rnd.nextInt(4)), 18, 0) : null;
                    boolean done = rnd.nextDouble() < 0.94 || backlog.size() >= MAX_BACKLOG || !backlog.add(title);
                    if (!done && due != null && offset > 4) {
                        due = null; // a stale backlog item, not a pile of overdue work
                    }
                    Instant completed = null;
                    if (done) {
                        boolean late = due != null && rnd.nextDouble() < 0.13;
                        LocalDate doneDay;
                        if (due != null) {
                            LocalDate dueDay = due.atZone(zone).toLocalDate();
                            long span = ChronoUnit.DAYS.between(day, dueDay);
                            doneDay = late ? dueDay.plusDays(1 + rnd.nextInt(2))
                                    : day.plusDays(span <= 0 ? 0 : rnd.nextInt((int) span + 1));
                        } else {
                            doneDay = day.plusDays(rnd.nextDouble() < 0.6 ? 0 : 1 + rnd.nextInt(2));
                        }
                        if (!doneDay.isBefore(today)) {
                            doneDay = today.minusDays(1);
                        }
                        completed = at(doneDay, productiveHour(doneDay), rnd.nextInt(60));
                        if (completed.isBefore(created)) {
                            completed = created.plus(Duration.ofMinutes(30 + rnd.nextInt(180)));
                        }
                        if (!late && due != null && completed.isAfter(due)) {
                            completed = due.minus(Duration.ofMinutes(20 + rnd.nextInt(150)));
                            if (completed.isBefore(created)) {
                                completed = created.plus(Duration.ofMinutes(10));
                            }
                        }
                        if (completed.isAfter(now)) {
                            completed = now.minus(Duration.ofHours(1));
                        }
                    }
                    addTask(title, t, priority(), created, due, completed, done ? "DONE" : "TODO", null, null);
                }
            }
        }

        /** Open work for today and the coming days so the Today and Board views look alive. */
        private void seedCurrentTasks() {
            Object[][] open = {
                {"Finish analytics dashboard charts", "Side project", new String[] {"frontend", "react"}, "HIGH", 0, 17, "IN_PROGRESS", "Ship portfolio v2"},
                {"Mock interview: Spring Boot internals", "Learning", new String[] {"interview", "spring"}, "URGENT", 0, 19, "TODO", "Crack the Java interview"},
                {"Reply to recruiter email", "Personal", new String[] {"career"}, "HIGH", 0, 13, "TODO", null},
                {"Code review: outbox consumer", "Work", new String[] {"code-review"}, "MEDIUM", 1, 12, "TODO", null},
                {"Write integration tests for habits API", "Work", new String[] {"testing", "java"}, "MEDIUM", 2, 18, "IN_PROGRESS", null},
                {"Record a 2-minute demo video", "Side project", new String[] {"marketing"}, "MEDIUM", 3, 20, "TODO", "Ship portfolio v2"},
                {"Practice SQL window functions", "Learning", new String[] {"sql"}, "LOW", 4, 21, "TODO", "Crack the Java interview"},
                {"Book a health check-up", "Personal", new String[] {"health"}, "LOW", 6, 11, "TODO", null},
                {"Update resume with Trackly", "Personal", new String[] {"career"}, "HIGH", -1, 18, "TODO", "Ship portfolio v2"},
                {"Renew gym membership", "Personal", new String[] {"fitness"}, "MEDIUM", -2, 10, "TODO", "Run a 10K"},
                {"Brainstorm next side project", "Side project", new String[] {"ideas"}, "LOW", -999, 0, "TODO", null},
                {"Learn Docker multi-stage builds", "Learning", new String[] {"devops"}, "MEDIUM", -999, 0, "TODO", null},
            };
            for (Object[] o : open) {
                int dueOffset = (Integer) o[4];
                Instant due = dueOffset == -999 ? null : at(today.plusDays(dueOffset), (Integer) o[5], 0);
                Instant created = at(today.minusDays(1 + rnd.nextInt(5)), 9 + rnd.nextInt(8), rnd.nextInt(60));
                Template t = new Template((String) o[0], (String) o[1], (String[]) o[2], (String) o[7]);
                UUID parent = addTask((String) o[0], t, (String) o[3], created, due, null, (String) o[6], null, null);
                if (o[0].toString().startsWith("Finish analytics")) {
                    Instant subDone = created.plus(Duration.ofHours(20));
                    addTask("Productivity score ring", t, "MEDIUM", created, null,
                            subDone.isAfter(now) ? now.minus(Duration.ofHours(2)) : subDone, "DONE", parent, null);
                    addTask("Peak-hours heatmap", t, "MEDIUM", created, null, null, "TODO", parent, null);
                    addTask("Weekly trend line", t, "LOW", created, null, null, "TODO", parent, null);
                }
            }

            // Work already finished earlier today, so the Today view shows a day in progress.
            int localHour = now.atZone(zone).getHour();
            if (localHour >= 9) {
                String[][] doneToday = {
                    {"Standup notes and plan the day", "Work", "planning"},
                    {"Fix flaky login test", "Work", "bug"},
                    {"Revise Java streams API", "Learning", "java"},
                };
                int n = Math.min(doneToday.length, 1 + (localHour - 9) / 2);
                for (int i = 0; i < n; i++) {
                    Instant finished = now.minus(Duration.ofMinutes(25 + 50L * i + rnd.nextInt(20)));
                    Instant started = finished.minus(Duration.ofMinutes(60 + rnd.nextInt(120)));
                    Template t = new Template(doneToday[i][0], doneToday[i][1], new String[] {doneToday[i][2]}, null);
                    addTask(doneToday[i][0], t, i == 1 ? "HIGH" : "MEDIUM", started, at(today, 18, 0), finished,
                            "DONE", null, null);
                }
            }
            // A recurring task.
            LocalDate sunday = today.plusDays((7 - today.getDayOfWeek().getValue()) % 7);
            addTask("Weekly review & plan next week", new Template("", "Personal", new String[] {"planning"}, null),
                    "MEDIUM", at(today.minusDays(6), 10, 0), at(sunday, 19, 0), null, "TODO", null, "WEEKLY");
        }

        private UUID addTask(String title, Template t, String priority, Instant created, Instant due,
                             Instant completed, String status, UUID parentId, String recurrence) {
            UUID id = UUID.randomUUID();
            UUID projectId = projects.get(t.project());
            UUID goalId = t.goal() == null ? null : goals.get(t.goal());
            position += 1000;
            taskRows.add(new Object[] {id, projectId, goalId, parentId, title, status, priority, t.tags(), due,
                position, recurrence, completed, created});

            Map<String, Object> snap = new LinkedHashMap<>();
            snap.put("id", id.toString());
            snap.put("title", title);
            snap.put("status", "TODO");
            snap.put("priority", priority);
            snap.put("tags", List.of(t.tags()));
            snap.put("projectId", str(projectId));
            snap.put("goalId", str(goalId));
            snap.put("parentId", str(parentId));
            snap.put("dueAt", str(due));
            snap.put("estimateMinutes", null);
            snap.put("recurrence", recurrence);
            snap.put("createdAt", created.toString());
            snap.put("completedAt", null);
            events.add(event(userId, EventTypes.TASK, id, EventTypes.TASK_CREATED, snap, created));
            if ("IN_PROGRESS".equals(status)) {
                Map<String, Object> wip = new LinkedHashMap<>(snap);
                wip.put("status", "IN_PROGRESS");
                events.add(event(userId, EventTypes.TASK, id, EventTypes.TASK_UPDATED, wip,
                        created.plus(Duration.ofMinutes(5))));
            }
            if (completed != null) {
                Map<String, Object> done = new LinkedHashMap<>(snap);
                done.put("status", "DONE");
                done.put("completedAt", completed.toString());
                events.add(event(userId, EventTypes.TASK, id, EventTypes.TASK_COMPLETED, done, completed));
                if (completed.isAfter(now.minus(Duration.ofDays(10)))) {
                    recentDoneTaskIds.add(id);
                }
            }
            return id;
        }

        private void insertTasks() {
            String sql = "INSERT INTO core.tasks (id, user_id, project_id, goal_id, parent_id, title, status, priority, "
                    + "tags, due_at, position, recurrence, completed_at, created_at, updated_at) "
                    + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            // Parents first so the parent_id foreign key is always satisfied.
            List<Object[]> ordered = new ArrayList<>(taskRows.stream().filter(r -> r[3] == null).toList());
            ordered.addAll(taskRows.stream().filter(r -> r[3] != null).toList());
            jdbc.batchUpdate(sql, ordered, 200, (ps, r) -> {
                ps.setObject(1, r[0]);
                ps.setObject(2, userId);
                ps.setObject(3, r[1]);
                ps.setObject(4, r[2]);
                ps.setObject(5, r[3]);
                ps.setString(6, (String) r[4]);
                ps.setString(7, (String) r[5]);
                ps.setString(8, (String) r[6]);
                ps.setArray(9, textArray(ps, (String[]) r[7]));
                ps.setTimestamp(10, ts((Instant) r[8]));
                ps.setDouble(11, (Double) r[9]);
                ps.setString(12, (String) r[10]);
                ps.setTimestamp(13, ts((Instant) r[11]));
                ps.setTimestamp(14, ts((Instant) r[12]));
                Instant updated = r[11] != null ? (Instant) r[11] : (Instant) r[12];
                ps.setTimestamp(15, ts(updated));
            });
        }

        private void seedHabits() {
            LocalDate created = today.minusDays(HISTORY_DAYS);
            Instant createdAt = at(created, 8, 0);
            int pos = 1;
            List<Object[]> checkins = new ArrayList<>();
            for (HabitSpec spec : HABITS) {
                UUID id = UUID.randomUUID();
                int mask = spec.days() == null ? HabitSchedule.ALL_DAYS : HabitSchedule.maskOf(spec.days());
                UUID goalId = spec.goal() == null ? null : goals.get(spec.goal());
                jdbc.update("INSERT INTO core.habits (id, user_id, goal_id, name, icon, color, frequency_type, "
                                + "target_per_week, days_of_week, reminder_time, freeze_tokens, position, created_at, "
                                + "updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        id, userId, goalId, spec.name(), spec.icon(), spec.color(), spec.freq().name(),
                        spec.target(), mask, spec.reminder(), 2, pos++, ts(createdAt), ts(createdAt));

                Map<String, Object> h = new LinkedHashMap<>();
                h.put("id", id.toString());
                h.put("name", spec.name());
                h.put("icon", spec.icon());
                h.put("color", spec.color());
                h.put("frequencyType", spec.freq().name());
                h.put("targetPerWeek", spec.target());
                h.put("daysOfWeek", mask);
                h.put("reminderTime", spec.reminder() == null ? null : spec.reminder().toString());
                h.put("goalId", str(goalId));
                h.put("archived", false);
                h.put("createdAt", createdAt.toString());
                events.add(event(userId, EventTypes.HABIT, id, EventTypes.HABIT_CREATED, h, createdAt));

                HabitSchedule schedule = new HabitSchedule(spec.freq(), spec.target(), mask);
                for (LocalDate d = created; !d.isAfter(today); d = d.plusDays(1)) {
                    if (!schedule.isScheduled(d)) {
                        continue;
                    }
                    double p = spec.baseRate();
                    if (spec.name().startsWith("Morning workout") && d.getDayOfWeek() == DayOfWeek.WEDNESDAY) {
                        p = 0.3; // the pattern the streak-risk detector should find
                    }
                    if (d.getDayOfWeek().getValue() >= 6 && spec.name().contains("LeetCode")) {
                        p -= 0.3;
                    }
                    if (d.isAfter(today.minusDays(9)) && !spec.name().startsWith("Morning")) {
                        p = Math.min(0.97, p + 0.2); // recent good run => visible streaks
                    }
                    if (d.equals(today)) {
                        p = spec.name().startsWith("Drink") || spec.name().startsWith("Meditate") ? 1 : 0;
                    }
                    if (rnd.nextDouble() >= p) {
                        continue;
                    }
                    int hour = spec.reminder() != null ? spec.reminder().getHour() : 19 + rnd.nextInt(3);
                    Instant checkedAt = at(d, hour, rnd.nextInt(50));
                    if (checkedAt.isAfter(now)) {
                        checkedAt = now.minus(Duration.ofMinutes(10));
                    }
                    Short mood = rnd.nextDouble() < 0.4 ? (short) (2 + rnd.nextInt(4)) : null;
                    checkins.add(new Object[] {UUID.randomUUID(), id, d, mood, checkedAt});
                    Map<String, Object> c = new LinkedHashMap<>();
                    c.put("habitId", id.toString());
                    c.put("date", d.toString());
                    c.put("mood", mood);
                    c.put("freeze", false);
                    c.put("checkedAt", checkedAt.toString());
                    events.add(event(userId, EventTypes.HABIT, id, EventTypes.HABIT_CHECKED, c, checkedAt));
                }
            }
            jdbc.batchUpdate("INSERT INTO core.habit_checkins (id, habit_id, user_id, day, mood, is_freeze, created_at) "
                    + "VALUES (?, ?, ?, ?, ?, FALSE, ?)", checkins, 200, (ps, r) -> {
                        ps.setObject(1, r[0]);
                        ps.setObject(2, r[1]);
                        ps.setObject(3, userId);
                        ps.setObject(4, r[2]);
                        if (r[3] == null) {
                            ps.setNull(5, java.sql.Types.SMALLINT);
                        } else {
                            ps.setShort(5, (Short) r[3]);
                        }
                        ps.setTimestamp(6, ts((Instant) r[4]));
                    });
        }

        private void seedFocus() {
            List<Object[]> rows = new ArrayList<>();
            for (int offset = HISTORY_DAYS - 7; offset >= 0; offset--) {
                LocalDate day = today.minusDays(offset);
                boolean weekend = day.getDayOfWeek().getValue() >= 6;
                int sessions = offset == 0 ? 1 : (weekend ? rnd.nextInt(2) : 1 + rnd.nextInt(3));
                for (int i = 0; i < sessions; i++) {
                    int planned = rnd.nextDouble() < 0.75 ? 25 : 50;
                    Instant start = offset == 0
                            ? now.minus(Duration.ofMinutes(90 + rnd.nextInt(60)))
                            : at(day, productiveHour(day), rnd.nextInt(30));
                    if (offset == 0 && !start.atZone(zone).toLocalDate().equals(today)) {
                        continue;
                    }
                    boolean completed = rnd.nextDouble() < 0.85;
                    int seconds = completed ? planned * 60 : (planned * 60) * (30 + rnd.nextInt(50)) / 100;
                    Instant end = start.plusSeconds(seconds);
                    if (end.isAfter(now)) {
                        continue;
                    }
                    UUID taskId = recentDoneTaskIds.isEmpty() || rnd.nextDouble() < 0.5 ? null
                            : recentDoneTaskIds.get(rnd.nextInt(recentDoneTaskIds.size()));
                    UUID id = UUID.randomUUID();
                    rows.add(new Object[] {id, taskId, start, end, planned, seconds, completed});
                    Map<String, Object> p = new LinkedHashMap<>();
                    p.put("id", id.toString());
                    p.put("taskId", str(taskId));
                    p.put("startedAt", start.toString());
                    p.put("endedAt", end.toString());
                    p.put("plannedMinutes", planned);
                    p.put("actualSeconds", seconds);
                    p.put("completed", completed);
                    events.add(event(userId, EventTypes.FOCUS, id, EventTypes.FOCUS_SESSION_RECORDED, p, end));
                }
            }
            jdbc.batchUpdate("INSERT INTO core.focus_sessions (id, user_id, task_id, started_at, ended_at, "
                    + "planned_minutes, actual_seconds, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    rows, 200, (ps, r) -> {
                        ps.setObject(1, r[0]);
                        ps.setObject(2, userId);
                        ps.setObject(3, r[1]);
                        ps.setTimestamp(4, ts((Instant) r[2]));
                        ps.setTimestamp(5, ts((Instant) r[3]));
                        ps.setInt(6, (Integer) r[4]);
                        ps.setInt(7, (Integer) r[5]);
                        ps.setBoolean(8, (Boolean) r[6]);
                        ps.setTimestamp(9, ts((Instant) r[3]));
                    });
        }

        /** Mornings (10-12) and mid-afternoons (15-17) dominate; Tue/Thu are a bit stronger. */
        private int productiveHour(LocalDate day) {
            double r = rnd.nextDouble();
            if (day.getDayOfWeek() == DayOfWeek.TUESDAY || day.getDayOfWeek() == DayOfWeek.THURSDAY) {
                r *= 0.85;
            }
            if (r < 0.42) {
                return 10 + rnd.nextInt(2);
            }
            if (r < 0.72) {
                return 15 + rnd.nextInt(2);
            }
            if (r < 0.86) {
                return 12 + rnd.nextInt(3);
            }
            return rnd.nextBoolean() ? 9 : 20 + rnd.nextInt(2);
        }

        private Template pick(boolean weekend) {
            if (weekend) {
                List<Template> light = TEMPLATES.stream()
                        .filter(t -> !t.project().equals("Work")).toList();
                return light.get(rnd.nextInt(light.size()));
            }
            return TEMPLATES.get(rnd.nextInt(TEMPLATES.size()));
        }

        private String fill(String title) {
            if (title.contains("%d")) {
                int n;
                if (title.contains("km")) {
                    n = 3 + rnd.nextInt(8); // building up to a 10K
                } else if (title.contains("problems")) {
                    n = 3 + rnd.nextInt(6);
                } else if (title.contains("chapter")) {
                    n = 1 + rnd.nextInt(12);
                } else {
                    n = 12 + rnd.nextInt(70);
                }
                return title.formatted(n);
            }
            if (title.contains("%s")) {
                return title.formatted(MODULES[rnd.nextInt(MODULES.length)]);
            }
            return title;
        }

        private String priority() {
            double r = rnd.nextDouble();
            return r < 0.2 ? "LOW" : r < 0.65 ? "MEDIUM" : r < 0.9 ? "HIGH" : "URGENT";
        }
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    private static Array textArray(PreparedStatement ps, String[] values) throws SQLException {
        return ps.getConnection().createArrayOf("text", values);
    }
}
