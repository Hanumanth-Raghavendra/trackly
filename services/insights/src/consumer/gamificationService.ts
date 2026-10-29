import type { Queryable } from '../db.js';
import { addDays, todayIn } from '../domain/dates.js';
import { dailyRows, habitInsights, userContext } from '../domain/analytics.js';
import {
  achievementByCode,
  levelForXp,
  newlyUnlocked,
  xpForLevel,
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

const TASK_COUNTS: Record<string, number> = { FIRST_STEPS: 1, GETTING_THINGS_DONE: 10, CENTURION: 100, TASK_LEGEND: 500 };
const FOCUS_MINUTES: Record<string, number> = { DEEP_DIVER: 60, FLOW_STATE: 600, MONK_MODE: 3000 };
const STREAK_DAYS: Record<string, number> = { ON_FIRE: 7, UNSTOPPABLE: 30 };
const LEVELS: Record<string, number> = { LEVEL_5: 5, LEVEL_10: 10 };

/**
 * When the user actually crossed an achievement's threshold, worked out from their history.
 * Matters when a backlog (an import, the demo seed, a long outage) is processed in one go:
 * "Complete 100 tasks" should be dated the day of task #100, not the day the batch ran.
 * Returns null when the moment can't be derived; the caller then uses the event time.
 */
async function crossedAt(q: Queryable, userId: string, code: string, tz: string): Promise<Date | null> {
  const one = async (sql: string, params: unknown[]) =>
    (await q.query<{ at: Date | null }>(sql, params)).rows[0]?.at ?? null;

  if (code in TASK_COUNTS) {
    return one(
      `SELECT completed_at AS at FROM insights.tasks WHERE user_id = $1 AND completed_at IS NOT NULL
        ORDER BY completed_at OFFSET $2 LIMIT 1`,
      [userId, TASK_COUNTS[code]! - 1],
    );
  }
  if (code in FOCUS_MINUTES) {
    return one(
      `SELECT ended_at AS at FROM (
         SELECT ended_at, sum(actual_seconds) OVER (ORDER BY ended_at, session_id) AS total
           FROM insights.focus_sessions WHERE user_id = $1) f
        WHERE total >= $2 ORDER BY ended_at LIMIT 1`,
      [userId, FOCUS_MINUTES[code]! * 60],
    );
  }
  if (code in LEVELS) {
    return one(
      `SELECT earned_at AS at FROM (
         SELECT earned_at, sum(delta) OVER (ORDER BY earned_at, source) AS total
           FROM insights.xp_ledger WHERE user_id = $1) x
        WHERE total >= $2 ORDER BY earned_at LIMIT 1`,
      [userId, xpForLevel(LEVELS[code]!)],
    );
  }
  if (code in STREAK_DAYS) {
    // Gaps-and-islands over daily habits: the Nth consecutive check-in of the earliest long run.
    return one(
      `SELECT min(reached) AS at FROM (
         SELECT (array_agg(checked_at ORDER BY day))[$2] AS reached
           FROM (SELECT c.habit_id, c.day, c.checked_at,
                        c.day - (row_number() OVER (PARTITION BY c.habit_id ORDER BY c.day))::int AS run
                   FROM insights.habit_checkins c JOIN insights.habits h ON h.habit_id = c.habit_id
                  WHERE c.user_id = $1 AND h.frequency_type = 'DAILY') s
          GROUP BY habit_id, run HAVING count(*) >= $2) r`,
      [userId, STREAK_DAYS[code]!],
    );
  }
  switch (code) {
    case 'HABIT_FORMED':
      return one('SELECT min(checked_at) AS at FROM insights.habit_checkins WHERE user_id = $1 AND NOT is_freeze', [userId]);
    case 'GOAL_GETTER':
      return one(`SELECT min(completed_at) AS at FROM insights.goals WHERE user_id = $1 AND status = 'COMPLETED'`, [userId]);
    case 'EARLY_BIRD':
      return one(
        `SELECT min(completed_at) AS at FROM insights.tasks WHERE user_id = $1 AND completed_at IS NOT NULL
            AND extract(hour FROM completed_at AT TIME ZONE $2) < 7`,
        [userId, tz],
      );
    case 'NIGHT_OWL':
      return one(
        `SELECT min(completed_at) AS at FROM insights.tasks WHERE user_id = $1 AND completed_at IS NOT NULL
            AND extract(hour FROM completed_at AT TIME ZONE $2) >= 23`,
        [userId, tz],
      );
    case 'WEEKEND_WARRIOR':
      return one(
        `SELECT min(fifth) AS at FROM (
           SELECT (array_agg(completed_at ORDER BY completed_at))[5] AS fifth FROM insights.tasks
            WHERE user_id = $1 AND completed_at IS NOT NULL AND extract(isodow FROM completed_at AT TIME ZONE $2) IN (6, 7)
            GROUP BY (completed_at AT TIME ZONE $2)::date HAVING count(*) >= 5) d`,
        [userId, tz],
      );
    default:
      return null;
  }
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
  if (fresh.length === 0) return fresh;
  const { timezone } = await userContext(q, userId);
  for (const a of fresh) {
    const crossed = await crossedAt(q, userId, a.code, timezone);
    const unlockedAt = crossed && crossed.getTime() <= at.getTime() ? crossed : at;
    await q.query(
      `INSERT INTO insights.achievements (user_id, code, unlocked_at) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [userId, a.code, unlockedAt],
    );
  }
  return fresh;
}

export { achievementByCode };
