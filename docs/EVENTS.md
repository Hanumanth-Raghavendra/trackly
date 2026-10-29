# Event contract (core-api → insights)

Every change in core-api writes a row to `core.outbox_events` **in the same database
transaction** as the change itself (the *transactional outbox* pattern). The insights service reads
that table in `id` order and builds its own read model in the `insights` schema.

```
┌──────────── one transaction ────────────┐
│ UPDATE core.tasks SET status = 'DONE'…   │      insights (OutboxConsumer)
│ INSERT INTO core.outbox_events (…)       │ ───▶ SELECT … WHERE id > last_offset ORDER BY id
└──────────────────────────────────────────┘      apply → projections, XP, achievements
              │ after commit                       commit offset + projections together
              └─▶ POST /internal/outbox/nudge      then: socket "sync", toasts, pushes
```

## Row shape

| Column | Meaning |
|---|---|
| `id` | `BIGSERIAL`, the consumer's cursor |
| `event_id` | UUID, unique per event |
| `user_id` | Owner; every event belongs to exactly one user |
| `aggregate_type` | `USER`, `TASK`, `HABIT`, `FOCUS`, `GOAL` |
| `aggregate_id` | ID of the changed entity |
| `event_type` | See below |
| `payload` | JSON, **a full snapshot** of the entity after the change |
| `occurred_at` | When it happened (the completion time for `TASK_COMPLETED`, which can be backdated by the demo seeder) |

Payloads carry the whole entity ("event-carried state transfer"), so the consumer upserts instead of
patching. Replaying an event, or applying it twice after a crash, gives the same result.

## Event types

| Type | Payload | Insights does |
|---|---|---|
| `USER_REGISTERED`, `USER_UPDATED` | `id, email, displayName, timezone, focusGoalMinutes, demo, createdAt` | Upserts `insights.users` (timezone drives every "day" calculation) |
| `USER_DELETED` | `id` | Deletes everything it holds for the user |
| `TASK_CREATED`, `TASK_UPDATED` | `id, title, status, priority, tags[], projectId, goalId, parentId, dueAt, estimateMinutes, recurrence, createdAt, completedAt` | Upserts `insights.tasks` |
| `TASK_COMPLETED` | same as above | Upserts, awards XP once (ledger key `task:<id>`) |
| `TASK_REOPENED` | same as above | Upserts, removes that task's XP |
| `TASK_DELETED` | `id` | Deletes the task |
| `HABIT_CREATED`, `HABIT_UPDATED` | `id, name, icon, color, frequencyType, targetPerWeek, daysOfWeek (bitmask Mon=1…Sun=64), reminderTime, goalId, archived, createdAt` | Upserts `insights.habits` |
| `HABIT_DELETED` | `id` | Deletes the habit and its check-ins |
| `HABIT_CHECKED` | `habitId, date, mood, freeze, checkedAt` | Upserts the check-in, awards XP (`habit:<id>:<date>`; freezes earn none) |
| `HABIT_UNCHECKED` | `habitId, date` | Deletes the check-in and its XP |
| `FOCUS_SESSION_RECORDED` | `id, taskId, startedAt, endedAt, plannedMinutes, actualSeconds, completed` | Inserts the session, awards XP (`focus:<id>`) |
| `FOCUS_SESSION_DELETED` | `id` | Deletes it and its XP |
| `GOAL_CREATED`, `GOAL_UPDATED` | `id, title, status, targetDate, completedAt` | Upserts `insights.goals` |
| `GOAL_COMPLETED` | same | Upserts, awards 50 XP once |
| `GOAL_DELETED` | `id` | Deletes the goal |

Unknown event types are **ignored, not failed**, so core can ship a new event before insights
knows how to handle it.

## Guarantees and how they're met

| Guarantee | How |
|---|---|
| No lost events | The event commits with the change or not at all (`Propagation.MANDATORY` on `OutboxPublisher`) |
| No duplicate effects | Offset and projections commit in one transaction; every handler is an idempotent upsert; XP is a ledger keyed by source |
| One consumer at a time | `pg_try_advisory_xact_lock` (works through connection poolers) |
| A bad event can't block the stream | Each event runs in a savepoint; failures go to `insights.dead_letters` |
| One user's failure can't block others | Per-user follow-up (XP, achievements) runs in its own savepoint |
| No toasts for things that didn't happen | Sockets, notifications and pushes go out only after commit |
| Near real time | Core POSTs `/internal/outbox/nudge` after commit; polling is only the fallback |

## Rebuilding the read model

Everything in the `insights` schema is derived. To rebuild it from the events still in the outbox
(kept for `OUTBOX_RETENTION_DAYS`, default 30):

```sql
UPDATE insights.consumer_offsets SET last_event_id = 0 WHERE consumer = 'outbox';
```
