import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AiProvider } from '../../src/ai/provider.js';
import { addDays, todayIn } from '../../src/domain/dates.js';
import { buildHarness, publish, resetDatabase, SERVICE_TOKEN, tokenFor, uuid } from './helpers.js';

const fakeAi: AiProvider = {
  name: 'fake',
  model: 'fake-1',
  enabled: true,
  complete: vi.fn(async ({ json }) => (json ? '{"subtasks":["Outline","Draft","Polish"]}' : 'Great week. Keep going.')),
};

const h = buildHarness(fakeAi);
const user = uuid();
let token: string;

beforeAll(async () => {
  await resetDatabase(h.db);
  token = await tokenFor(user);
  const today = todayIn('Asia/Kolkata');
  const habitId = uuid();
  await publish(h.db, user, 'USER_REGISTERED', { id: user, email: 'x@y.z', displayName: 'X', timezone: 'Asia/Kolkata', focusGoalMinutes: 60, demo: false });
  await publish(h.db, user, 'HABIT_CREATED', { id: habitId, name: 'Read', icon: '📚', frequencyType: 'DAILY', targetPerWeek: 7, daysOfWeek: 127, archived: false, createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString() });
  for (let i = 1; i <= 5; i++) {
    await publish(h.db, user, 'HABIT_CHECKED', { habitId, date: addDays(today, -i), mood: 4, freeze: false, checkedAt: new Date(Date.now() - i * 86_400_000).toISOString() });
  }
  const now = new Date();
  await publish(h.db, user, 'TASK_COMPLETED', {
    id: uuid(), title: 'Ship it', status: 'DONE', priority: 'MEDIUM', tags: ['work'], dueAt: null,
    createdAt: new Date(now.getTime() - 3_600_000).toISOString(), completedAt: now.toISOString(),
  });
  await publish(h.db, user, 'FOCUS_SESSION_RECORDED', {
    id: uuid(), taskId: null, startedAt: new Date(now.getTime() - 1_800_000).toISOString(), endedAt: now.toISOString(),
    plannedMinutes: 25, actualSeconds: 1500, completed: true,
  });
  await h.consumer.drain();
});

afterAll(async () => {
  await h.db.end();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('insights API', () => {
  it('rejects requests without a valid token', async () => {
    await request(h.app).get('/api/v1/insights/overview').expect(401);
    await request(h.app).get('/api/v1/insights/overview').set('Authorization', 'Bearer nope').expect(401);
  });

  it('serves the Today overview with an explainable score', async () => {
    const res = await request(h.app).get('/api/v1/insights/overview').set(auth()).expect(200);
    expect(res.body.today.tasksCompleted).toBe(1);
    expect(res.body.today.focusMinutes).toBe(25);
    expect(res.body.score.score).toBeGreaterThan(0);
    expect(res.body.score.components.length).toBeGreaterThanOrEqual(3);
    expect(res.body.activeStreak).toBeGreaterThanOrEqual(5);
    expect(res.body.atRiskHabits[0]).toMatchObject({ name: 'Read', level: 'medium' });
    expect(res.body.trend).toHaveLength(14);
  });

  it('validates query parameters', async () => {
    const res = await request(h.app).get('/api/v1/insights/analytics/scores?days=9999').set(auth()).expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('returns analytics sections', async () => {
    const scores = await request(h.app).get('/api/v1/insights/analytics/scores?days=14').set(auth()).expect(200);
    expect(scores.body).toHaveLength(14);
    const heat = await request(h.app).get('/api/v1/insights/analytics/heatmap').set(auth()).expect(200);
    expect(heat.body.tasks).toHaveLength(7);
    const habits = await request(h.app).get('/api/v1/insights/analytics/habits').set(auth()).expect(200);
    expect(habits.body[0].currentStreak).toBe(5);
    const breakdown = await request(h.app).get('/api/v1/insights/analytics/breakdown').set(auth()).expect(200);
    expect(breakdown.body.tags[0]).toEqual({ tag: 'work', count: 1 });
  });

  it('builds a weekly review', async () => {
    const res = await request(h.app).get('/api/v1/insights/reviews/weekly').set(auth()).expect(200);
    expect(res.body.totals.tasksCompleted).toBeGreaterThanOrEqual(1);
    expect(res.body.coachSummary).toBeTruthy();
    expect(res.body.suggestions.length).toBeGreaterThan(0);
    // The current week is still running, so it is compared with the same days of last week.
    expect(res.body.inProgress).toBe(res.body.weekEnd > res.body.days.at(-1).date);
    expect(res.body.comparedDays).toBe(res.body.days.length);

    const lastWeek = await request(h.app)
      .get('/api/v1/insights/reviews/weekly')
      .query({ weekStart: '2020-01-06' })
      .set(auth())
      .expect(200);
    expect(lastWeek.body.inProgress).toBe(false);
    expect(lastWeek.body.comparedDays).toBe(7);
    expect(lastWeek.body.days).toHaveLength(7);
  });

  it('exposes gamification and notifications', async () => {
    const g = await request(h.app).get('/api/v1/insights/gamification').set(auth()).expect(200);
    expect(g.body.xp).toBe(42); // 25 habit + 12 task + 5 focus
    expect(g.body.achievements.find((a: { code: string }) => a.code === 'FIRST_STEPS').unlockedAt).not.toBeNull();

    const n = await request(h.app).get('/api/v1/insights/notifications').set(auth()).expect(200);
    expect(n.body.unread).toBeGreaterThan(0);
    await request(h.app).post('/api/v1/insights/notifications/read').set(auth()).send({}).expect(204);
    const after = await request(h.app).get('/api/v1/insights/notifications').set(auth()).expect(200);
    expect(after.body.unread).toBe(0);
  });

  it('uses the configured AI provider behind a stable API', async () => {
    const cfg = await request(h.app).get('/api/v1/insights/config').expect(200);
    expect(cfg.body.ai).toMatchObject({ enabled: true, provider: 'fake' });

    const b = await request(h.app).post('/api/v1/insights/ai/breakdown').set(auth()).send({ title: 'Write a blog post' }).expect(200);
    expect(b.body.subtasks).toEqual(['Outline', 'Draft', 'Polish']);

    const s = await request(h.app).post('/api/v1/insights/ai/weekly-summary').set(auth()).send({}).expect(200);
    expect(s.body.summary).toContain('Great week');
    const review = await request(h.app).get('/api/v1/insights/reviews/weekly').set(auth()).expect(200);
    expect(review.body.ai.summary).toContain('Great week');
  });

  it('protects internal endpoints with the service token', async () => {
    await request(h.app).post('/internal/outbox/nudge').expect(401);
    await request(h.app).post('/internal/outbox/nudge').set('X-Service-Token', SERVICE_TOKEN).expect(202);
    const tick = await request(h.app).post('/internal/cron/tick').set('X-Service-Token', SERVICE_TOKEN).expect(200);
    expect(tick.body).toHaveProperty('habits');
  });
});
