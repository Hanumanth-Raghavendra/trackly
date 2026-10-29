import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { addDays, isValidDay, todayIn, weekStart } from '../domain/dates.js';
import {
  activeStreak,
  breakdown,
  dailyRows,
  focusStats,
  habitInsights,
  heatmap,
  procrastination,
  userContext,
} from '../domain/analytics.js';
import { levelProgress } from '../domain/gamification.js';
import { generateInsights } from '../domain/insights.js';
import { buildWeeklyReview } from '../domain/review.js';

const daysParam = (def: number, max = 365) => z.object({ days: z.coerce.number().int().min(7).max(max).default(def) });

export function analyticsRouter(db: Db) {
  const r = Router();

  const ctxFor = (req: Request) => userContext(db, req.user!.id, req.user!.timezone);

  /** Everything the "Today" dashboard needs in one round trip. */
  r.get('/overview', async (req, res) => {
    const ctx = await ctxFor(req);
    const today = todayIn(ctx.timezone);
    const [rows, heat, proc, habits, stats] = await Promise.all([
      dailyRows(db, ctx, addDays(today, -27), today),
      heatmap(db, ctx, 28),
      procrastination(db, ctx, 30),
      habitInsights(db, ctx, 56),
      db.query<{ xp: number }>('SELECT xp FROM insights.user_stats WHERE user_id = $1', [ctx.userId]),
    ]);
    const todayRow = rows[rows.length - 1]!;
    const last7 = rows.slice(-7);
    res.json({
      date: today,
      timezone: ctx.timezone,
      score: todayRow.score,
      yesterdayScore: rows[rows.length - 2]?.score.score ?? null,
      weekAverage: Math.round(last7.reduce((s, d) => s + d.score.score, 0) / last7.length),
      today: {
        tasksCompleted: todayRow.inputs.tasksCompleted,
        tasksDue: todayRow.inputs.tasksDue,
        habitsDone: todayRow.inputs.habitsDone,
        habitsDue: todayRow.inputs.habitsDue,
        focusMinutes: todayRow.inputs.focusMinutes,
        focusGoal: todayRow.inputs.focusGoal,
      },
      activeStreak: activeStreak(rows),
      level: levelProgress(stats.rows[0]?.xp ?? 0),
      overdue: proc.overdueOpen,
      atRiskHabits: habits.filter((h) => h.risk).map((h) => ({ habitId: h.habitId, name: h.name, ...h.risk })),
      insights: generateInsights({ days: rows, heatmap: heat, procrastination: proc, habits }).slice(0, 4),
      trend: rows.slice(-14).map((d) => ({ date: d.date, score: d.score.score })),
    });
  });

  r.get('/analytics/scores', async (req, res) => {
    const { days } = daysParam(30).parse(req.query);
    const ctx = await ctxFor(req);
    const today = todayIn(ctx.timezone);
    const rows = await dailyRows(db, ctx, addDays(today, -(days - 1)), today);
    res.json(
      rows.map((d) => ({
        date: d.date,
        score: d.score.score,
        label: d.score.label,
        components: d.score.components,
        tasksCompleted: d.inputs.tasksCompleted,
        tasksDue: d.inputs.tasksDue,
        habitsDone: d.inputs.habitsDone,
        habitsDue: d.inputs.habitsDue,
        focusMinutes: d.inputs.focusMinutes,
        moodAvg: d.moodAvg,
      })),
    );
  });

  r.get('/analytics/heatmap', async (req, res) => {
    const { days } = daysParam(56).parse(req.query);
    res.json(await heatmap(db, await ctxFor(req), days));
  });

  r.get('/analytics/procrastination', async (req, res) => {
    const { days } = daysParam(60).parse(req.query);
    res.json(await procrastination(db, await ctxFor(req), days));
  });

  r.get('/analytics/habits', async (req, res) => {
    const { days } = daysParam(90).parse(req.query);
    res.json(await habitInsights(db, await ctxFor(req), days));
  });

  r.get('/analytics/breakdown', async (req, res) => {
    const { days } = daysParam(30).parse(req.query);
    res.json(await breakdown(db, await ctxFor(req), days));
  });

  r.get('/analytics/focus', async (req, res) => {
    const { days } = daysParam(30).parse(req.query);
    res.json(await focusStats(db, await ctxFor(req), days));
  });

  r.get('/insights', async (req, res) => {
    const { days } = daysParam(28, 90).parse(req.query);
    const ctx = await ctxFor(req);
    const today = todayIn(ctx.timezone);
    const [rows, heat, proc, habits] = await Promise.all([
      dailyRows(db, ctx, addDays(today, -(days - 1)), today),
      heatmap(db, ctx, days),
      procrastination(db, ctx, days),
      habitInsights(db, ctx, 56),
    ]);
    res.json(generateInsights({ days: rows, heatmap: heat, procrastination: proc, habits }));
  });

  r.get('/reviews/weekly', async (req, res) => {
    const ctx = await ctxFor(req);
    const today = todayIn(ctx.timezone);
    const requested = typeof req.query.weekStart === 'string' && isValidDay(req.query.weekStart) ? req.query.weekStart : today;
    const start = weekStart(requested);
    const review = await buildWeeklyReview(db, ctx, start, today);
    const cached = await db.query<{ ai_summary: string | null; ai_provider: string | null; generated_at: Date }>(
      'SELECT ai_summary, ai_provider, generated_at FROM insights.weekly_reviews WHERE user_id = $1 AND week_start = $2',
      [ctx.userId, start],
    );
    const ai = cached.rows[0];
    res.json({
      ...review,
      ai: ai?.ai_summary ? { summary: ai.ai_summary, provider: ai.ai_provider, generatedAt: ai.generated_at } : null,
    });
  });

  return r;
}
