-- Trackly core schema (system of record).
-- Flyway runs this inside the `core` schema; the insights service owns the `insights` schema.

CREATE TABLE users (
    id                  UUID PRIMARY KEY,
    email               VARCHAR(254) NOT NULL,
    password_hash       VARCHAR(100) NOT NULL,
    display_name        VARCHAR(80)  NOT NULL,
    timezone            VARCHAR(64)  NOT NULL DEFAULT 'UTC',
    focus_goal_minutes  INTEGER      NOT NULL DEFAULT 60,
    is_demo             BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_users_email ON users (lower(email));
CREATE INDEX ix_users_demo_created ON users (created_at) WHERE is_demo;

-- Refresh tokens are stored hashed. `family_id` groups a chain of rotated tokens so that
-- re-use of an already-rotated token can revoke the whole chain (token theft detection).
CREATE TABLE refresh_tokens (
    id           UUID PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    family_id    UUID        NOT NULL,
    token_hash   VARCHAR(64) NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,
    replaced_by  UUID,
    user_agent   VARCHAR(255),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_refresh_tokens_hash ON refresh_tokens (token_hash);
CREATE INDEX ix_refresh_tokens_family ON refresh_tokens (family_id);
CREATE INDEX ix_refresh_tokens_user ON refresh_tokens (user_id);

CREATE TABLE projects (
    id          UUID PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        VARCHAR(60) NOT NULL,
    color       VARCHAR(16) NOT NULL DEFAULT '#6366f1',
    archived    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_projects_user ON projects (user_id);

CREATE TABLE goals (
    id           UUID PRIMARY KEY,
    user_id      UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title        VARCHAR(120) NOT NULL,
    description  VARCHAR(2000),
    color        VARCHAR(16)  NOT NULL DEFAULT '#f59e0b',
    target_date  DATE,
    status       VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_goals_status CHECK (status IN ('ACTIVE', 'COMPLETED', 'ARCHIVED'))
);
CREATE INDEX ix_goals_user ON goals (user_id);

CREATE TABLE tasks (
    id                UUID PRIMARY KEY,
    user_id           UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    project_id        UUID          REFERENCES projects (id) ON DELETE SET NULL,
    goal_id           UUID          REFERENCES goals (id) ON DELETE SET NULL,
    parent_id         UUID          REFERENCES tasks (id) ON DELETE CASCADE,
    title             VARCHAR(200)  NOT NULL,
    description       VARCHAR(5000),
    status            VARCHAR(16)   NOT NULL DEFAULT 'TODO',
    priority          VARCHAR(16)   NOT NULL DEFAULT 'MEDIUM',
    tags              TEXT[]        NOT NULL DEFAULT '{}',
    due_at            TIMESTAMPTZ,
    estimate_minutes  INTEGER,
    position          DOUBLE PRECISION NOT NULL DEFAULT 0,
    recurrence        VARCHAR(16),
    recurrence_spawned BOOLEAN      NOT NULL DEFAULT FALSE,
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT ck_tasks_status CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE')),
    CONSTRAINT ck_tasks_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    CONSTRAINT ck_tasks_recurrence CHECK (recurrence IS NULL OR recurrence IN ('DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY'))
);
CREATE INDEX ix_tasks_user_status ON tasks (user_id, status);
CREATE INDEX ix_tasks_user_due ON tasks (user_id, due_at);
CREATE INDEX ix_tasks_parent ON tasks (parent_id);
CREATE INDEX ix_tasks_goal ON tasks (goal_id);

CREATE TABLE habits (
    id               UUID PRIMARY KEY,
    user_id          UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    goal_id          UUID         REFERENCES goals (id) ON DELETE SET NULL,
    name             VARCHAR(80)  NOT NULL,
    description      VARCHAR(500),
    icon             VARCHAR(16)  NOT NULL DEFAULT '✅',
    color            VARCHAR(16)  NOT NULL DEFAULT '#10b981',
    frequency_type   VARCHAR(16)  NOT NULL DEFAULT 'DAILY',
    target_per_week  INTEGER      NOT NULL DEFAULT 7,
    days_of_week     INTEGER      NOT NULL DEFAULT 127,  -- bitmask: Mon=1, Tue=2, ... Sun=64
    reminder_time    TIME,
    freeze_tokens    INTEGER      NOT NULL DEFAULT 1,
    archived         BOOLEAN      NOT NULL DEFAULT FALSE,
    position         INTEGER      NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_habits_frequency CHECK (frequency_type IN ('DAILY', 'WEEKLY_TIMES', 'SPECIFIC_DAYS')),
    CONSTRAINT ck_habits_target CHECK (target_per_week BETWEEN 1 AND 7),
    CONSTRAINT ck_habits_days CHECK (days_of_week BETWEEN 1 AND 127),
    CONSTRAINT ck_habits_freeze CHECK (freeze_tokens BETWEEN 0 AND 3)
);
CREATE INDEX ix_habits_user ON habits (user_id);

CREATE TABLE habit_checkins (
    id          UUID PRIMARY KEY,
    habit_id    UUID         NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
    user_id     UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    day         DATE         NOT NULL,
    note        VARCHAR(500),
    mood        SMALLINT,
    is_freeze   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_checkins_mood CHECK (mood IS NULL OR mood BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX ux_checkins_habit_day ON habit_checkins (habit_id, day);
CREATE INDEX ix_checkins_user_day ON habit_checkins (user_id, day);

CREATE TABLE focus_sessions (
    id               UUID PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    task_id          UUID        REFERENCES tasks (id) ON DELETE SET NULL,
    started_at       TIMESTAMPTZ NOT NULL,
    ended_at         TIMESTAMPTZ NOT NULL,
    planned_minutes  INTEGER     NOT NULL,
    actual_seconds   INTEGER     NOT NULL,
    completed        BOOLEAN     NOT NULL DEFAULT TRUE,
    note             VARCHAR(500),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_focus_time CHECK (ended_at >= started_at),
    CONSTRAINT ck_focus_planned CHECK (planned_minutes BETWEEN 1 AND 240)
);
CREATE INDEX ix_focus_user_started ON focus_sessions (user_id, started_at);

-- Transactional outbox: written in the SAME transaction as the business change, so an event
-- exists if and only if the change committed. The insights service reads this table in id order.
CREATE TABLE outbox_events (
    id              BIGSERIAL PRIMARY KEY,
    event_id        UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL,
    aggregate_type  VARCHAR(32) NOT NULL,
    aggregate_id    UUID        NOT NULL,
    event_type      VARCHAR(48) NOT NULL,
    payload         JSONB       NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_outbox_event_id ON outbox_events (event_id);
CREATE INDEX ix_outbox_created ON outbox_events (created_at);
