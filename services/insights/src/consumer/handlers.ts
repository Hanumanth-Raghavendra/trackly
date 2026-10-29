import type { Tx } from '../db.js';
import { GOAL_XP, xpForFocus, xpForHabit, xpForTask, type XpAward } from '../domain/gamification.js';

/** One row of core.outbox_events. */
export interface OutboxEvent {
  id: number;
  event_id: string;
  user_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
}

/** What a handler tells the consumer about the event it just applied. */
export interface HandlerResult {
  entity: 'user' | 'tasks' | 'habits' | 'focus' | 'goals' | null;
  xp?: XpAward;
  userDeleted?: boolean;
}

type P = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function awardXp(tx: Tx, userId: string, source: string, award: XpAward, at: Date) {
  if (award.delta === 0) return false;
  const { rowCount } = await tx.query(
    `INSERT INTO insights.xp_ledger (user_id, source, reason, delta, earned_at)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, source) DO NOTHING`,
    [userId, source, award.reason, award.delta, at],
  );
  return (rowCount ?? 0) > 0;
}

async function revokeXp(tx: Tx, userId: string, source: string) {
  await tx.query('DELETE FROM insights.xp_ledger WHERE user_id = $1 AND source = $2', [userId, source]);
}

async function upsertTask(tx: Tx, userId: string, p: P) {
  await tx.query(
    `INSERT INTO insights.tasks (task_id, user_id, title, status, priority, tags, project_id, goal_id, parent_id,
                                 due_at, estimate_minutes, created_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (task_id) DO UPDATE SET
       title = EXCLUDED.title, status = EXCLUDED.status, priority = EXCLUDED.priority, tags = EXCLUDED.tags,
       project_id = EXCLUDED.project_id, goal_id = EXCLUDED.goal_id, parent_id = EXCLUDED.parent_id,
       due_at = EXCLUDED.due_at, estimate_minutes = EXCLUDED.estimate_minutes, completed_at = EXCLUDED.completed_at`,
    [
      p.id, userId, p.title ?? '', p.status ?? 'TODO', p.priority ?? 'MEDIUM',
      Array.isArray(p.tags) ? p.tags.map(String) : [],
      str(p.projectId), str(p.goalId), str(p.parentId), str(p.dueAt), num(p.estimateMinutes),
      str(p.createdAt) ?? new Date().toISOString(), str(p.completedAt),
    ],
  );
}

async function upsertHabit(tx: Tx, userId: string, p: P) {
  await tx.query(
    `INSERT INTO insights.habits (habit_id, user_id, name, icon, color, frequency_type, target_per_week,
                                  days_of_week, reminder_time, archived, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (habit_id) DO UPDATE SET
       name = EXCLUDED.name, icon = EXCLUDED.icon, color = EXCLUDED.color, frequency_type = EXCLUDED.frequency_type,
       target_per_week = EXCLUDED.target_per_week, days_of_week = EXCLUDED.days_of_week,
       reminder_time = EXCLUDED.reminder_time, archived = EXCLUDED.archived`,
    [
      p.id, userId, p.name ?? '', str(p.icon), str(p.color), p.frequencyType ?? 'DAILY',
      num(p.targetPerWeek) ?? 7, num(p.daysOfWeek) ?? 127, str(p.reminderTime), Boolean(p.archived),
      str(p.createdAt) ?? new Date().toISOString(),
    ],
  );
}

/**
 * Applies one event to the read model. Every write is an idempotent upsert/delete keyed by the
 * aggregate id, so re-processing an event (after a crash between apply and commit) is harmless.
 */
export async function applyEvent(tx: Tx, e: OutboxEvent): Promise<HandlerResult> {
  const p = e.payload as P;
  const userId = e.user_id;

  switch (e.event_type) {
    case 'USER_REGISTERED':
    case 'USER_UPDATED':
      await tx.query(
        `INSERT INTO insights.users (user_id, email, display_name, timezone, focus_goal_minutes, demo, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
           timezone = EXCLUDED.timezone, focus_goal_minutes = EXCLUDED.focus_goal_minutes, demo = EXCLUDED.demo`,
        [userId, str(p.email), str(p.displayName), str(p.timezone) ?? 'UTC', num(p.focusGoalMinutes) ?? 60,
          Boolean(p.demo), str(p.createdAt) ?? e.occurred_at.toISOString()],
      );
      return { entity: 'user' };

    case 'USER_DELETED':
      for (const table of ['tasks', 'habits', 'habit_checkins', 'focus_sessions', 'goals', 'xp_ledger', 'user_stats',
        'achievements', 'notifications', 'push_subscriptions', 'weekly_reviews', 'reminder_log', 'users']) {
        await tx.query(`DELETE FROM insights.${table} WHERE user_id = $1`, [userId]);
      }
      return { entity: null, userDeleted: true };

    case 'TASK_CREATED':
    case 'TASK_UPDATED':
      await upsertTask(tx, userId, p);
      return { entity: 'tasks' };

    case 'TASK_COMPLETED': {
      await upsertTask(tx, userId, p);
      const award = xpForTask({ priority: String(p.priority), dueAt: str(p.dueAt), completedAt: str(p.completedAt) });
      const at = p.completedAt ? new Date(String(p.completedAt)) : e.occurred_at;
      const awarded = await awardXp(tx, userId, `task:${p.id}`, award, at);
      return { entity: 'tasks', xp: awarded ? award : undefined };
    }

    case 'TASK_REOPENED':
      await upsertTask(tx, userId, p);
      await revokeXp(tx, userId, `task:${p.id}`);
      return { entity: 'tasks' };

    case 'TASK_DELETED':
      await tx.query('DELETE FROM insights.tasks WHERE task_id = $1 AND user_id = $2', [p.id, userId]);
      return { entity: 'tasks' };

    case 'HABIT_CREATED':
    case 'HABIT_UPDATED':
      await upsertHabit(tx, userId, p);
      return { entity: 'habits' };

    case 'HABIT_DELETED':
      await tx.query('DELETE FROM insights.habit_checkins WHERE habit_id = $1', [p.id]);
      await tx.query('DELETE FROM insights.habits WHERE habit_id = $1 AND user_id = $2', [p.id, userId]);
      return { entity: 'habits' };

    case 'HABIT_CHECKED': {
      const freeze = Boolean(p.freeze);
      const checkedAt = p.checkedAt ? new Date(String(p.checkedAt)) : e.occurred_at;
      await tx.query(
        `INSERT INTO insights.habit_checkins (habit_id, day, user_id, mood, is_freeze, checked_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (habit_id, day) DO UPDATE SET mood = EXCLUDED.mood, is_freeze = EXCLUDED.is_freeze`,
        [p.habitId, p.date, userId, num(p.mood), freeze, checkedAt],
      );
      const award = xpForHabit(freeze);
      const awarded = await awardXp(tx, userId, `habit:${p.habitId}:${p.date}`, award, checkedAt);
      return { entity: 'habits', xp: awarded ? award : undefined };
    }

    case 'HABIT_UNCHECKED':
      await tx.query('DELETE FROM insights.habit_checkins WHERE habit_id = $1 AND day = $2', [p.habitId, p.date]);
      await revokeXp(tx, userId, `habit:${p.habitId}:${p.date}`);
      return { entity: 'habits' };

    case 'FOCUS_SESSION_RECORDED': {
      await tx.query(
        `INSERT INTO insights.focus_sessions (session_id, user_id, task_id, started_at, ended_at, planned_minutes,
                                              actual_seconds, completed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (session_id) DO NOTHING`,
        [p.id, userId, str(p.taskId), p.startedAt, p.endedAt, num(p.plannedMinutes) ?? 25,
          num(p.actualSeconds) ?? 0, Boolean(p.completed)],
      );
      const award = xpForFocus(num(p.actualSeconds) ?? 0, Boolean(p.completed));
      const awarded = await awardXp(tx, userId, `focus:${p.id}`, award, new Date(String(p.endedAt)));
      return { entity: 'focus', xp: awarded ? award : undefined };
    }

    case 'FOCUS_SESSION_DELETED':
      await tx.query('DELETE FROM insights.focus_sessions WHERE session_id = $1 AND user_id = $2', [p.id, userId]);
      await revokeXp(tx, userId, `focus:${p.id}`);
      return { entity: 'focus' };

    case 'GOAL_CREATED':
    case 'GOAL_UPDATED':
    case 'GOAL_COMPLETED': {
      await tx.query(
        `INSERT INTO insights.goals (goal_id, user_id, title, status, completed_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (goal_id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status,
           completed_at = EXCLUDED.completed_at`,
        [p.id, userId, p.title ?? '', p.status ?? 'ACTIVE', str(p.completedAt)],
      );
      if (e.event_type === 'GOAL_COMPLETED') {
        const awarded = await awardXp(tx, userId, `goal:${p.id}`, GOAL_XP, e.occurred_at);
        return { entity: 'goals', xp: awarded ? GOAL_XP : undefined };
      }
      return { entity: 'goals' };
    }

    case 'GOAL_DELETED':
      await tx.query('DELETE FROM insights.goals WHERE goal_id = $1 AND user_id = $2', [p.id, userId]);
      return { entity: 'goals' };

    default:
      // Unknown types are ignored, not failed: a newer core can ship events before insights knows them.
      return { entity: null };
  }
}
