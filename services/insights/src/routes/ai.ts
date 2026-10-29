import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Db } from '../db.js';
import { breakDownTask, summariseWeek } from '../ai/features.js';
import { AiDisabledError, type AiProvider } from '../ai/provider.js';
import { isValidDay, todayIn, weekStart } from '../domain/dates.js';
import { userContext } from '../domain/analytics.js';
import { buildWeeklyReview } from '../domain/review.js';

export function aiRouter(db: Db, ai: AiProvider) {
  const r = Router();

  // Free AI tiers have tight quotas; keep one user from burning the whole budget.
  r.use(
    rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 30,
      keyGenerator: (req) => req.user!.id,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { code: 'RATE_LIMITED', detail: 'AI limit reached, try again later' },
    }),
  );

  r.use((_req, _res, next) => {
    if (!ai.enabled) throw new AiDisabledError();
    next();
  });

  r.post('/breakdown', async (req, res) => {
    const { title, description } = z
      .object({ title: z.string().trim().min(3).max(200), description: z.string().max(2000).optional() })
      .parse(req.body);
    const subtasks = await breakDownTask(ai, title, description);
    res.json({ subtasks, provider: ai.name, model: ai.model });
  });

  r.post('/weekly-summary', async (req, res) => {
    const body = z.object({ weekStart: z.string().optional() }).parse(req.body ?? {});
    const ctx = await userContext(db, req.user!.id, req.user!.timezone);
    const today = todayIn(ctx.timezone);
    const start = weekStart(body.weekStart && isValidDay(body.weekStart) ? body.weekStart : today);
    const review = await buildWeeklyReview(db, ctx, start, today);
    const { coachSummary: _ignored, days: _days, ...stats } = review;
    const summary = await summariseWeek(ai, stats);
    await db.query(
      `INSERT INTO insights.weekly_reviews (user_id, week_start, ai_summary, ai_provider, generated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id, week_start) DO UPDATE SET ai_summary = EXCLUDED.ai_summary,
         ai_provider = EXCLUDED.ai_provider, generated_at = now()`,
      [ctx.userId, start, summary, ai.name],
    );
    res.json({ summary, provider: ai.name, weekStart: start });
  });

  return r;
}
