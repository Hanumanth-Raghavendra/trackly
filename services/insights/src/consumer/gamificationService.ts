import type { Queryable } from '../db.js';
import { addDays, todayIn } from '../domain/dates.js';
import { dailyRows, habitInsights, userContext } from '../domain/analytics.js';
import {
  achievementByCode,
  levelForXp,
  newlyUnlocked,
  type AchievementDef,
  type AchievementMetrics,
} from '../domain/gamification.js';

/** Recomputes XP/level from the ledger; returns before/after so callers can detect level-ups. */
export async function refreshStats(q: Queryable, userId: string) {
  const { rows } = await q.query<{ xp: number | null; prev_level: number | null }>(
    `SELECT (SELECT coalesce(sum(delta), 0) FROM insights.xp_ledger WHERE user_id = $1)::int AS xp,
            (SELECT level FROM insights.user_stats WHERE user_id = $1) AS prev_level`,
    [userId],
  );
  const xp = Math.max(0, rows[0]?.xp ?? 0);
  const level = levelForXp(xp);
  const previousLevel = rows[0]?.prev_level ?? 1;
  await q.query(
    `INSERT INTO insights.user_stats (user_id, xp, level, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE SET xp = EXCLUDED.xp, level = EXCLUDED.level, updated_at = now()`,
    [userId, xp, level],
  );
  return { xp, level, previousLevel };
}

export async function achievementMetrics(q: Queryable, userId: string, level: number): Promise<AchievementMetrics> {
  const ctx = await userContext(q, userId);
  const { rows } = await q.query<{
    tasks_completed: number;
    habit_checkins: number;
    focus_minutes: number;
    goals_completed: number;
    early: number;
    night: number;
    weekend_max: number;
  }>(
    `SELECT
       (SELECT count(*) FROM insights.tasks WHERE user_id = $1 AND completed_at IS NOT NULL)::int AS tasks_completed,
       (SELECT count(*) FROM insights.habit_checkins WHERE user_id = $1 AND NOT is_freeze)::int AS habit_checkins,
       (SELECT coalesce(sum(actual_seconds), 0) / 60 FROM insights.focus_sessions WHERE user_id = $1)::int AS focus_minutes,
       (SELECT count(*) FROM insights.goals WHERE user_id = $1 AND status = 'COMPLETED')::int AS goals_completed,
       (SELECT count(*) FROM insights.tasks WHERE user_id = $1 AND completed_at IS NOT NULL
           AND extract(hour FROM completed_at AT TIME ZONE $2) < 7)::int AS early,
       (SELECT count(*) FROM insights.tasks WHERE user_id = $1 AND completed_at IS NOT NULL
           AND extract(hour FROM completed_at AT TIME ZONE $2) >= 23)::int AS night,
       (SELECT coalesce(max(c), 0) FROM (
           SELECT count(*) AS c FROM insights.tasks WHERE user_id = $1 AND completed_at IS NOT NULL
              AND extract(isodow FROM completed_at AT TIME ZONE $2) IN (6, 7)
            GROUP BY (completed_at AT TIME ZONE $2)::date) w)::int AS weekend_max`,
    [userId, ctx.timezone],
  );
  const r = rows[0]!;

  const habits = await habitInsights(q, ctx, 90);
  const bestHabitStreakDays = habits
    .filter((h) => h.unit === 'days')
    .reduce((best, h) => Math.max(best, h.longestStreak), 0);

  const today = todayIn(ctx.timezone);
  const days = await dailyRows(q, ctx, addDays(today, -59), today);
  const perfectDays = days.filter(
    (d) => d.inputs.habitsDue > 0 && d.inputs.habitsDone >= d.inputs.habitsDue && d.inputs.tasksCompleted >= 3,
  ).length;

  return {
    tasksCompleted: r.tasks_completed,
    habitCheckins: r.habit_checkins,
    bestHabitStreakDays,
    focusMinutes: r.focus_minutes,
    goalsCompleted: r.goals_completed,
    earlyBirdTasks: r.early,
    nightOwlTasks: r.night,
    maxTasksOnWeekendDay: r.weekend_max,
    perfectDays,
    level,
  };
}

/** Inserts any achievements the user now qualifies for; returns only the new ones. */
export async function unlockAchievements(
  q: Queryable,
  userId: string,
  level: number,
  at: Date,
): Promise<AchievementDef[]> {
  const metrics = await achievementMetrics(q, userId, level);
  const { rows } = await q.query<{ code: string }>('SELECT code FROM insights.achievements WHERE user_id = $1', [
    userId,
  ]);
  const fresh = newlyUnlocked(metrics, new Set(rows.map((r) => r.code)));
  for (const a of fresh) {
    await q.query(
      `INSERT INTO insights.achievements (user_id, code, unlocked_at) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [userId, a.code, at],
    );
  }
  return fresh;
}

export { achievementByCode };
