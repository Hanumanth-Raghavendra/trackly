import { parallel, type Queryable } from '../db.js';
import { addDays, dayRange, formatHour, safeZone, todayIn, weekdayOf, WEEKDAY_NAMES } from './dates.js';
import { habitStats, isScheduled, type Frequency } from './schedule.js';
import { scoreDay, type DayInputs, type DayScore } from './score.js';

/**
 * The behaviour engine's read queries. Everything is computed per user, in the user's own
 * timezone, from the projections the outbox consumer maintains.
 */

export interface UserContext {
  userId: string;
  timezone: string;
  focusGoal: number;
  displayName: string;
}

export async function userContext(q: Queryable, userId: string, fallbackTz = 'UTC'): Promise<UserContext> {
  const { rows } = await q.query<{ timezone: string; focus_goal_minutes: number; display_name: string | null }>(
    'SELECT timezone, focus_goal_minutes, display_name FROM insights.users WHERE user_id = $1',
    [userId],
  );
  const row = rows[0];
  return {
    userId,
    timezone: safeZone(row?.timezone ?? fallbackTz),
    focusGoal: row?.focus_goal_minutes ?? 60,
    displayName: row?.display_name ?? '',
  };
}

// ---------------------------------------------------------------------------------------------
// Daily rows (the basis for scores, trends and weekly reviews)
// ---------------------------------------------------------------------------------------------

export interface HabitRow {
  habit_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  frequency_type: Frequency;
  target_per_week: number;
  days_of_week: number;
  archived: boolean;
  created_on: string;
}

export interface CheckinRow {
  habit_id: string;
  day: string;
  mood: number | null;
  is_freeze: boolean;
}

export interface DayRow {
  date: string;
  inputs: DayInputs;
  focusSessions: number;
  moodAvg: number | null;
  score: DayScore;
}

export async function loadHabits(q: Queryable, ctx: UserContext): Promise<HabitRow[]> {
  const { rows } = await q.query<HabitRow>(
    `SELECT habit_id, name, icon, color, frequency_type, target_per_week, days_of_week, archived,
            (created_at AT TIME ZONE $2)::date AS created_on
       FROM insights.habits WHERE user_id = $1 ORDER BY created_at`,
    [ctx.userId, ctx.timezone],
  );
  return rows;
}

export async function loadCheckins(q: Queryable, userId: string, from: string, to: string): Promise<CheckinRow[]> {
  const { rows } = await q.query<CheckinRow>(
    `SELECT habit_id, day, mood, is_freeze FROM insights.habit_checkins
      WHERE user_id = $1 AND day BETWEEN $2::date AND $3::date`,
    [userId, from, to],
  );
  return rows;
}

export async function dailyRows(q: Queryable, ctx: UserContext, from: string, to: string): Promise<DayRow[]> {
  const params = [ctx.userId, ctx.timezone, from, to];
  const [completions, due, focus, habits, checkins] = await parallel(q, [
    () => q.query<{ d: string; n: number; on_time: number }>(
      `SELECT (completed_at AT TIME ZONE $2)::date AS d, count(*)::int AS n,
              count(*) FILTER (WHERE due_at IS NULL OR completed_at <= due_at)::int AS on_time
         FROM insights.tasks
        WHERE user_id = $1 AND completed_at IS NOT NULL
          AND (completed_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
        GROUP BY 1`,
      params,
    ),
    () => q.query<{ d: string; n: number }>(
      `SELECT (due_at AT TIME ZONE $2)::date AS d, count(*)::int AS n
         FROM insights.tasks
        WHERE user_id = $1 AND due_at IS NOT NULL AND parent_id IS NULL
          AND (due_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
        GROUP BY 1`,
      params,
    ),
    () => q.query<{ d: string; secs: number; sessions: number }>(
      `SELECT (started_at AT TIME ZONE $2)::date AS d, sum(actual_seconds)::int AS secs, count(*)::int AS sessions
         FROM insights.focus_sessions
        WHERE user_id = $1 AND (started_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
        GROUP BY 1`,
      params,
    ),
    () => loadHabits(q, ctx),
    () => loadCheckins(q, ctx.userId, from, to)]);

  const byDay = <T extends { d: string }>(rows: T[]) => new Map(rows.map((r) => [r.d, r]));
  const completed = byDay(completions.rows);
  const dueMap = byDay(due.rows);
  const focusMap = byDay(focus.rows);
  const activeHabits = habits.filter((h) => !h.archived);
  const checkinsByDay = new Map<string, CheckinRow[]>();
  for (const c of checkins) {
    const list = checkinsByDay.get(c.day) ?? [];
    list.push(c);
    checkinsByDay.set(c.day, list);
  }

  return dayRange(from, to).map((date) => {
    const dayCheckins = checkinsByDay.get(date) ?? [];
    const doneIds = new Set(dayCheckins.filter((c) => !c.is_freeze).map((c) => c.habit_id));
    let habitsDue = 0;
    let habitsDone = 0;
    let habitsConfigured = 0;
    for (const h of activeHabits) {
      if (h.created_on > date) continue;
      habitsConfigured++;
      const isDue =
        h.frequency_type === 'WEEKLY_TIMES'
          ? doneIds.has(h.habit_id)
          : isScheduled({ frequencyType: h.frequency_type, daysOfWeek: h.days_of_week }, date);
      if (!isDue) continue;
      habitsDue++;
      if (doneIds.has(h.habit_id)) habitsDone++;
    }
    const moods = dayCheckins.map((c) => c.mood).filter((m): m is number => m !== null);
    const inputs: DayInputs = {
      tasksCompleted: completed.get(date)?.n ?? 0,
      tasksCompletedOnTime: completed.get(date)?.on_time ?? 0,
      tasksDue: dueMap.get(date)?.n ?? 0,
      habitsDone,
      habitsDue,
      habitsConfigured,
      focusMinutes: Math.round((focusMap.get(date)?.secs ?? 0) / 60),
      focusGoal: ctx.focusGoal,
    };
    return {
      date,
      inputs,
      focusSessions: focusMap.get(date)?.sessions ?? 0,
      moodAvg: moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null,
      score: scoreDay(inputs),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// When do you get things done?
// ---------------------------------------------------------------------------------------------

export interface Heatmap {
  days: number;
  tasks: number[][]; // [weekday 0=Mon][hour]
  focusMinutes: number[][];
  peakHour: number | null;
  peakWeekday: number | null; // 1 = Monday
  weekdayTotals: number[]; // tasks per weekday, Mon..Sun
  totalCompletions: number;
}

export async function heatmap(q: Queryable, ctx: UserContext, days: number): Promise<Heatmap> {
  const [tasks, focus] = await parallel(q, [
    () => q.query<{ dow: number; h: number; n: number }>(
      `SELECT extract(isodow FROM completed_at AT TIME ZONE $2)::int AS dow,
              extract(hour FROM completed_at AT TIME ZONE $2)::int AS h, count(*)::int AS n
         FROM insights.tasks
        WHERE user_id = $1 AND completed_at >= now() - make_interval(days => $3)
        GROUP BY 1, 2`,
      [ctx.userId, ctx.timezone, days],
    ),
    () => q.query<{ dow: number; h: number; mins: number }>(
      `SELECT extract(isodow FROM started_at AT TIME ZONE $2)::int AS dow,
              extract(hour FROM started_at AT TIME ZONE $2)::int AS h, (sum(actual_seconds) / 60)::int AS mins
         FROM insights.focus_sessions
        WHERE user_id = $1 AND started_at >= now() - make_interval(days => $3)
        GROUP BY 1, 2`,
      [ctx.userId, ctx.timezone, days],
    )]);
  const grid = () => Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const t = grid();
  const f = grid();
  for (const r of tasks.rows) t[r.dow - 1]![r.h] = r.n;
  for (const r of focus.rows) f[r.dow - 1]![r.h] = r.mins;

  const hourTotals = Array<number>(24).fill(0);
  const weekdayTotals = Array<number>(7).fill(0);
  let total = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const weight = t[d]![h]! + f[d]![h]! / 25; // a 25-minute focus block ~ one task
      hourTotals[h]! += weight;
      weekdayTotals[d]! += t[d]![h]!;
      total += t[d]![h]!;
    }
  }
  const argmax = (arr: number[]) => arr.reduce((best, v, i) => (v > (arr[best] ?? -1) ? i : best), 0);
  const peakHour = total + focus.rows.length >= 5 ? argmax(hourTotals) : null;
  const peakWeekday = total >= 7 ? argmax(weekdayTotals) + 1 : null;
  return { days, tasks: t, focusMinutes: f, peakHour, peakWeekday, weekdayTotals, totalCompletions: total };
}

// ---------------------------------------------------------------------------------------------
// Procrastination & planning
// ---------------------------------------------------------------------------------------------

export interface Procrastination {
  days: number;
  tasksWithDueDate: number;
  onTimeRate: number | null;
  lateRate: number | null;
  /** Average share of the available time used before finishing (0 = instantly, 100 = at the deadline). */
  index: number | null;
  avgLateHours: number | null;
  avgDaysToComplete: number | null;
  byPriority: { priority: string; withDue: number; late: number; lateRate: number | null }[];
  overdueOpen: number;
  oldestOverdue: { title: string; dueAt: string } | null;
  createdPerDay: number;
  completedPerDay: number;
}

export async function procrastination(q: Queryable, ctx: UserContext, days: number): Promise<Procrastination> {
  const [byPriority, overall, overdue, flow] = await parallel(q, [
    () => q.query<{ priority: string; with_due: number; late: number }>(
      `SELECT priority, count(*) FILTER (WHERE due_at IS NOT NULL)::int AS with_due,
              count(*) FILTER (WHERE due_at IS NOT NULL AND completed_at > due_at)::int AS late
         FROM insights.tasks
        WHERE user_id = $1 AND completed_at >= now() - make_interval(days => $2)
        GROUP BY priority`,
      [ctx.userId, days],
    ),
    () => q.query<{ window_used: number | null; avg_late_h: number | null; avg_days: number | null }>(
      `SELECT avg(LEAST(1.5, extract(epoch FROM completed_at - created_at)
                             / NULLIF(extract(epoch FROM due_at - created_at), 0)))
                FILTER (WHERE due_at > created_at) AS window_used,
              avg(extract(epoch FROM completed_at - due_at) / 3600) FILTER (WHERE completed_at > due_at) AS avg_late_h,
              avg(extract(epoch FROM completed_at - created_at) / 86400) AS avg_days
         FROM insights.tasks
        WHERE user_id = $1 AND completed_at >= now() - make_interval(days => $2)`,
      [ctx.userId, days],
    ),
    () => q.query<{ n: number; title: string | null; due_at: Date | null }>(
      `SELECT count(*) OVER ()::int AS n, title, due_at
         FROM insights.tasks
        WHERE user_id = $1 AND completed_at IS NULL AND status <> 'DONE' AND due_at < now()
        ORDER BY due_at ASC LIMIT 1`,
      [ctx.userId],
    ),
    () => q.query<{ created: number; completed: number }>(
      `SELECT count(*) FILTER (WHERE created_at >= now() - make_interval(days => $2))::int AS created,
              count(*) FILTER (WHERE completed_at >= now() - make_interval(days => $2))::int AS completed
         FROM insights.tasks WHERE user_id = $1 AND parent_id IS NULL`,
      [ctx.userId, days],
    )]);
  const withDue = byPriority.rows.reduce((s, r) => s + r.with_due, 0);
  const late = byPriority.rows.reduce((s, r) => s + r.late, 0);
  const o = overall.rows[0];
  const order = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
  const od = overdue.rows[0];
  const round1 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10) / 10);
  return {
    days,
    tasksWithDueDate: withDue,
    onTimeRate: withDue ? Math.round(((withDue - late) / withDue) * 1000) / 1000 : null,
    lateRate: withDue ? Math.round((late / withDue) * 1000) / 1000 : null,
    index: o?.window_used == null ? null : Math.round(o.window_used * 100),
    avgLateHours: round1(o?.avg_late_h),
    avgDaysToComplete: round1(o?.avg_days),
    byPriority: byPriority.rows
      .sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority))
      .map((r) => ({
        priority: r.priority,
        withDue: r.with_due,
        late: r.late,
        lateRate: r.with_due ? Math.round((r.late / r.with_due) * 1000) / 1000 : null,
      })),
    overdueOpen: od?.n ?? 0,
    oldestOverdue: od?.title && od.due_at ? { title: od.title, dueAt: od.due_at.toISOString() } : null,
    createdPerDay: Math.round(((flow.rows[0]?.created ?? 0) / days) * 10) / 10,
    completedPerDay: Math.round(((flow.rows[0]?.completed ?? 0) / days) * 10) / 10,
  };
}

// ---------------------------------------------------------------------------------------------
// Habits: consistency, weekday patterns, streak risk
// ---------------------------------------------------------------------------------------------

export interface HabitInsight {
  habitId: string;
  name: string;
  icon: string | null;
  color: string | null;
  frequencyType: Frequency;
  currentStreak: number;
  longestStreak: number;
  unit: 'days' | 'weeks';
  completionRate30d: number;
  doneToday: boolean;
  dueToday: boolean;
  /** Share of scheduled days missed per weekday over the last 8 weeks (Mon..Sun, null = never scheduled). */
  weekdayMissRate: (number | null)[];
  moodAvg: number | null;
  doneDays: string[];
  risk: { level: 'high' | 'medium'; reason: string } | null;
}

export async function habitInsights(q: Queryable, ctx: UserContext, days: number): Promise<HabitInsight[]> {
  const today = todayIn(ctx.timezone);
  const from = addDays(today, -Math.max(days, 90));
  const [habits, checkins] = await parallel(q, [() => loadHabits(q, ctx), () => loadCheckins(q, ctx.userId, from, today)]);
  const byHabit = new Map<string, CheckinRow[]>();
  for (const c of checkins) {
    const list = byHabit.get(c.habit_id) ?? [];
    list.push(c);
    byHabit.set(c.habit_id, list);
  }

  return habits
    .filter((h) => !h.archived)
    .map((h) => {
      const rows = byHabit.get(h.habit_id) ?? [];
      const done = new Set(rows.map((r) => r.day));
      const like = {
        frequencyType: h.frequency_type,
        targetPerWeek: h.target_per_week,
        daysOfWeek: h.days_of_week,
        createdOn: h.created_on,
      };
      const stats = habitStats(like, done, today);

      // Weekday miss pattern over the last 8 full weeks (day-based habits only).
      const scheduled = Array<number>(7).fill(0);
      const missed = Array<number>(7).fill(0);
      if (h.frequency_type !== 'WEEKLY_TIMES') {
        for (let d = addDays(today, -56); d < today; d = addDays(d, 1)) {
          if (d < h.created_on || !isScheduled(like, d)) continue;
          const wd = weekdayOf(d) - 1;
          scheduled[wd]!++;
          if (!done.has(d)) missed[wd]!++;
        }
      }
      const weekdayMissRate = scheduled.map((s, i) => (s >= 3 ? Math.round((missed[i]! / s) * 100) / 100 : null));
      const moods = rows.map((r) => r.mood).filter((m): m is number => m !== null);

      let risk: HabitInsight['risk'] = null;
      const todayIdx = weekdayOf(today) - 1;
      const todayMiss = weekdayMissRate[todayIdx];
      if (stats.dueToday && !stats.doneToday) {
        if (todayMiss != null && todayMiss >= 0.5) {
          risk = {
            level: 'high',
            reason: `You usually skip this on ${WEEKDAY_NAMES[todayIdx]}s (${Math.round(todayMiss * 100)}% of the time).`,
          };
        } else if (stats.currentStreak >= 5 && stats.unit === 'days') {
          risk = { level: 'medium', reason: `Your ${stats.currentStreak}-day streak ends tonight if you skip it.` };
        }
      }

      return {
        habitId: h.habit_id,
        name: h.name,
        icon: h.icon,
        color: h.color,
        frequencyType: h.frequency_type,
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
        unit: stats.unit,
        completionRate30d: stats.completionRate30d,
        doneToday: stats.doneToday,
        dueToday: stats.dueToday,
        weekdayMissRate,
        moodAvg: moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null,
        doneDays: [...done].filter((d) => d >= addDays(today, -(days - 1))).sort(),
        risk,
      };
    });
}

// ---------------------------------------------------------------------------------------------
// What do you spend effort on?
// ---------------------------------------------------------------------------------------------

export async function breakdown(q: Queryable, ctx: UserContext, days: number) {
  const [tags, projects, priorities] = await parallel(q, [
    () => q.query<{ tag: string; n: number }>(
      `SELECT tag, count(*)::int AS n FROM insights.tasks, unnest(tags) AS tag
        WHERE user_id = $1 AND completed_at >= now() - make_interval(days => $2)
        GROUP BY tag ORDER BY n DESC, tag LIMIT 10`,
      [ctx.userId, days],
    ),
    () => q.query<{ project_id: string | null; n: number }>(
      `SELECT project_id, count(*)::int AS n FROM insights.tasks
        WHERE user_id = $1 AND completed_at >= now() - make_interval(days => $2)
        GROUP BY project_id ORDER BY n DESC`,
      [ctx.userId, days],
    ),
    () => q.query<{ priority: string; n: number }>(
      `SELECT priority, count(*)::int AS n FROM insights.tasks
        WHERE user_id = $1 AND completed_at >= now() - make_interval(days => $2)
        GROUP BY priority`,
      [ctx.userId, days],
    )]);
  return {
    days,
    tags: tags.rows.map((r) => ({ tag: r.tag, count: r.n })),
    projects: projects.rows.map((r) => ({ projectId: r.project_id, count: r.n })),
    priorities: priorities.rows.map((r) => ({ priority: r.priority, count: r.n })),
  };
}

export async function focusStats(q: Queryable, ctx: UserContext, days: number) {
  const { rows } = await q.query<{
    total_secs: number | null;
    sessions: number;
    completed: number;
    avg_secs: number | null;
  }>(
    `SELECT sum(actual_seconds)::int AS total_secs, count(*)::int AS sessions,
            count(*) FILTER (WHERE completed)::int AS completed, avg(actual_seconds) AS avg_secs
       FROM insights.focus_sessions
      WHERE user_id = $1 AND started_at >= now() - make_interval(days => $2)`,
    [ctx.userId, days],
  );
  const r = rows[0];
  return {
    days,
    totalMinutes: Math.round((r?.total_secs ?? 0) / 60),
    sessions: r?.sessions ?? 0,
    completionRate: r?.sessions ? Math.round(((r.completed ?? 0) / r.sessions) * 1000) / 1000 : null,
    avgSessionMinutes: r?.avg_secs ? Math.round(r.avg_secs / 60) : null,
  };
}

/** Consecutive days (ending today, or yesterday if today is still empty) with any activity. */
export function activeStreak(rows: DayRow[]): number {
  const active = (r: DayRow) => r.inputs.tasksCompleted + r.inputs.habitsDone + r.inputs.focusMinutes > 0;
  let i = rows.length - 1;
  if (i >= 0 && !active(rows[i]!)) i--;
  let streak = 0;
  for (; i >= 0 && active(rows[i]!); i--) streak++;
  return streak;
}

export { formatHour };
