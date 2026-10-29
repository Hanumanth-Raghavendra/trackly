-- Insights read model. Everything here is DERIVED from core's outbox events and can be rebuilt
-- by resetting insights.consumer_offsets to 0 (as long as the events are still in the outbox).

CREATE TABLE insights.consumer_offsets (
    consumer       TEXT PRIMARY KEY,
    last_event_id  BIGINT      NOT NULL DEFAULT 0,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO insights.consumer_offsets (consumer) VALUES ('outbox');

-- Events that failed processing are parked here instead of blocking the stream.
CREATE TABLE insights.dead_letters (
    event_id    BIGINT PRIMARY KEY,
    event_type  TEXT        NOT NULL,
    payload     JSONB       NOT NULL,
    error       TEXT        NOT NULL,
    failed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE insights.users (
    user_id             UUID PRIMARY KEY,
    email               TEXT,
    display_name        TEXT,
    timezone            TEXT        NOT NULL DEFAULT 'UTC',
    focus_goal_minutes  INTEGER     NOT NULL DEFAULT 60,
    demo                BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ
);

CREATE TABLE insights.tasks (
    task_id           UUID PRIMARY KEY,
    user_id           UUID        NOT NULL,
    title             TEXT        NOT NULL,
    status            TEXT        NOT NULL,
    priority          TEXT        NOT NULL,
    tags              TEXT[]      NOT NULL DEFAULT '{}',
    project_id        UUID,
    goal_id           UUID,
    parent_id         UUID,
    due_at            TIMESTAMPTZ,
    estimate_minutes  INTEGER,
    created_at        TIMESTAMPTZ NOT NULL,
    completed_at      TIMESTAMPTZ
);
CREATE INDEX ix_ins_tasks_user_completed ON insights.tasks (user_id, completed_at);
CREATE INDEX ix_ins_tasks_user_due ON insights.tasks (user_id, due_at);
CREATE INDEX ix_ins_tasks_user_created ON insights.tasks (user_id, created_at);

CREATE TABLE insights.habits (
    habit_id         UUID PRIMARY KEY,
    user_id          UUID        NOT NULL,
    name             TEXT        NOT NULL,
    icon             TEXT,
    color            TEXT,
    frequency_type   TEXT        NOT NULL,
    target_per_week  INTEGER     NOT NULL,
    days_of_week     INTEGER     NOT NULL,
    reminder_time    TIME,
    archived         BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_ins_habits_user ON insights.habits (user_id);

CREATE TABLE insights.habit_checkins (
    habit_id    UUID        NOT NULL,
    day         DATE        NOT NULL,
    user_id     UUID        NOT NULL,
    mood        SMALLINT,
    is_freeze   BOOLEAN     NOT NULL DEFAULT FALSE,
    checked_at  TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (habit_id, day)
);
CREATE INDEX ix_ins_checkins_user_day ON insights.habit_checkins (user_id, day);

CREATE TABLE insights.focus_sessions (
    session_id       UUID PRIMARY KEY,
    user_id          UUID        NOT NULL,
    task_id          UUID,
    started_at       TIMESTAMPTZ NOT NULL,
    ended_at         TIMESTAMPTZ NOT NULL,
    planned_minutes  INTEGER     NOT NULL,
    actual_seconds   INTEGER     NOT NULL,
    completed        BOOLEAN     NOT NULL
);
CREATE INDEX ix_ins_focus_user_started ON insights.focus_sessions (user_id, started_at);

CREATE TABLE insights.goals (
    goal_id       UUID PRIMARY KEY,
    user_id       UUID        NOT NULL,
    title         TEXT        NOT NULL,
    status        TEXT        NOT NULL,
    completed_at  TIMESTAMPTZ
);

-- Gamification. XP is an append-only ledger keyed by its source, so replaying an event never
-- double-counts, and reopening a task removes exactly the XP it earned.
CREATE TABLE insights.xp_ledger (
    user_id     UUID        NOT NULL,
    source      TEXT        NOT NULL,
    reason      TEXT        NOT NULL,
    delta       INTEGER     NOT NULL,
    earned_at   TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, source)
);
CREATE INDEX ix_ins_xp_user_earned ON insights.xp_ledger (user_id, earned_at);

CREATE TABLE insights.user_stats (
    user_id     UUID PRIMARY KEY,
    xp          INTEGER     NOT NULL DEFAULT 0,
    level       INTEGER     NOT NULL DEFAULT 1,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE insights.achievements (
    user_id      UUID        NOT NULL,
    code         TEXT        NOT NULL,
    unlocked_at  TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, code)
);

CREATE TABLE insights.notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL,
    type        TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    body        TEXT        NOT NULL,
    data        JSONB       NOT NULL DEFAULT '{}',
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_ins_notifications_user ON insights.notifications (user_id, created_at DESC);

CREATE TABLE insights.push_subscriptions (
    endpoint    TEXT PRIMARY KEY,
    user_id     UUID        NOT NULL,
    p256dh      TEXT        NOT NULL,
    auth        TEXT        NOT NULL,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_ins_push_user ON insights.push_subscriptions (user_id);

CREATE TABLE insights.weekly_reviews (
    user_id       UUID        NOT NULL,
    week_start    DATE        NOT NULL,
    ai_summary    TEXT,
    ai_provider   TEXT,
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, week_start)
);

-- De-duplicates reminders ("remind about habit X once per day").
CREATE TABLE insights.reminder_log (
    user_id  UUID NOT NULL,
    kind     TEXT NOT NULL,
    ref      TEXT NOT NULL,
    day      DATE NOT NULL,
    sent_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, kind, ref, day)
);
