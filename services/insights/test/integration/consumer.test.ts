import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildHarness, publish, resetDatabase, uuid } from './helpers.js';

const h = buildHarness();

beforeAll(async () => {
  await resetDatabase(h.db);
});

afterAll(async () => {
  await h.db.end();
});

beforeEach(() => {
  h.realtime.sent = [];
});

function task(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: 'Write tests',
    status: 'TODO',
    priority: 'HIGH',
    tags: ['java'],
    projectId: null,
    goalId: null,
    parentId: null,
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
    estimateMinutes: null,
    recurrence: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  };
}

describe('OutboxConsumer', () => {
  it('builds the read model, awards XP and unlocks achievements exactly once', async () => {
    const user = uuid();
    const taskId = uuid();
    await publish(h.db, user, 'USER_REGISTERED', { id: user, email: 'a@b.c', displayName: 'A', timezone: 'Asia/Kolkata', focusGoalMinutes: 60, demo: false });
    await publish(h.db, user, 'TASK_CREATED', task(taskId));
    const completedAt = new Date().toISOString();
    await publish(h.db, user, 'TASK_COMPLETED', task(taskId, { status: 'DONE', completedAt }));

    expect(await h.consumer.drain()).toBe(3);

    const t = await h.db.query('SELECT status, completed_at FROM insights.tasks WHERE task_id = $1', [taskId]);
    expect(t.rows[0].status).toBe('DONE');
    const xp = await h.db.query('SELECT xp, level FROM insights.user_stats WHERE user_id = $1', [user]);
    expect(xp.rows[0]).toEqual({ xp: 18, level: 1 }); // 10 base + 5 HIGH + 3 on time
    const ach = await h.db.query('SELECT code FROM insights.achievements WHERE user_id = $1', [user]);
    expect(ach.rows.map((r) => r.code)).toEqual(['FIRST_STEPS']);

    // Live events produce socket messages and a notification after commit.
    const events = h.realtime.sent.filter((s) => s.userId === user).map((s) => s.event);
    expect(events).toEqual(expect.arrayContaining(['xp', 'achievement', 'notification', 'sync', 'stats']));

    // Replaying the same events (e.g. offset reset) must not double count.
    await h.db.query("UPDATE insights.consumer_offsets SET last_event_id = 0 WHERE consumer = 'outbox'");
    await h.consumer.drain();
    const again = await h.db.query('SELECT xp FROM insights.user_stats WHERE user_id = $1', [user]);
    expect(again.rows[0].xp).toBe(18);
  });

  it('reverts XP when a task is reopened or a check-in undone', async () => {
    const user = uuid();
    const taskId = uuid();
    const habitId = uuid();
    await publish(h.db, user, 'TASK_COMPLETED', task(taskId, { status: 'DONE', completedAt: new Date().toISOString(), priority: 'LOW', dueAt: null }));
    await publish(h.db, user, 'HABIT_CREATED', { id: habitId, name: 'Read', frequencyType: 'DAILY', targetPerWeek: 7, daysOfWeek: 127, archived: false, createdAt: new Date().toISOString() });
    await publish(h.db, user, 'HABIT_CHECKED', { habitId, date: '2026-10-29', mood: 4, freeze: false, checkedAt: new Date().toISOString() });
    await h.consumer.drain();
    let xp = await h.db.query('SELECT xp FROM insights.user_stats WHERE user_id = $1', [user]);
    expect(xp.rows[0].xp).toBe(15);

    await publish(h.db, user, 'TASK_REOPENED', task(taskId, { status: 'TODO', priority: 'LOW', dueAt: null }));
    await publish(h.db, user, 'HABIT_UNCHECKED', { habitId, date: '2026-10-29' });
    await h.consumer.drain();
    xp = await h.db.query('SELECT xp FROM insights.user_stats WHERE user_id = $1', [user]);
    expect(xp.rows[0].xp).toBe(0);
  });

  it('keeps history quiet: old events unlock achievements silently', async () => {
    const user = uuid();
    const old = new Date(Date.now() - 30 * 86_400_000);
    await publish(h.db, user, 'TASK_COMPLETED', task(uuid(), { status: 'DONE', completedAt: old.toISOString() }), old);
    await h.consumer.drain();
    const ach = await h.db.query('SELECT count(*)::int AS n FROM insights.achievements WHERE user_id = $1', [user]);
    expect(ach.rows[0].n).toBe(1);
    const notes = await h.db.query('SELECT count(*)::int AS n FROM insights.notifications WHERE user_id = $1', [user]);
    expect(notes.rows[0].n).toBe(0);
    expect(h.realtime.sent.filter((s) => s.userId === user && s.event === 'achievement')).toHaveLength(0);
  });

  it('parks a poison event in dead letters and keeps going', async () => {
    const user = uuid();
    await publish(h.db, user, 'TASK_CREATED', { id: 'not-a-uuid', title: 'Broken' });
    const okTask = uuid();
    await publish(h.db, user, 'TASK_CREATED', task(okTask));
    await h.consumer.drain();
    const dead = await h.db.query("SELECT count(*)::int AS n FROM insights.dead_letters WHERE event_type = 'TASK_CREATED'");
    expect(dead.rows[0].n).toBe(1);
    const ok = await h.db.query('SELECT count(*)::int AS n FROM insights.tasks WHERE task_id = $1', [okTask]);
    expect(ok.rows[0].n).toBe(1);
  });

  it('purges everything when a user is deleted', async () => {
    const user = uuid();
    await publish(h.db, user, 'TASK_COMPLETED', task(uuid(), { status: 'DONE', completedAt: new Date().toISOString() }));
    await h.consumer.drain();
    await publish(h.db, user, 'USER_DELETED', { id: user });
    await h.consumer.drain();
    for (const table of ['tasks', 'xp_ledger', 'user_stats', 'achievements', 'notifications']) {
      const r = await h.db.query(`SELECT count(*)::int AS n FROM insights.${table} WHERE user_id = $1`, [user]);
      expect(r.rows[0].n, table).toBe(0);
    }
  });
  it('dates backfilled achievements by when the threshold was really crossed', async () => {
    const user = uuid();
    const day = 86_400_000;
    const start = Date.now() - 20 * day;
    await publish(h.db, user, 'USER_REGISTERED', { id: user, email: 'b@b.c', displayName: 'B', timezone: 'Asia/Calcutta', focusGoalMinutes: 60, demo: false });
    for (let i = 0; i < 12; i++) {
      const completedAt = new Date(start + i * day).toISOString();
      await publish(h.db, user, 'TASK_COMPLETED', task(uuid(), { status: 'DONE', completedAt, dueAt: null }), new Date(completedAt));
    }
    await h.consumer.drain();

    const { rows } = await h.db.query<{ code: string; unlocked_at: Date }>(
      `SELECT code, unlocked_at FROM insights.achievements WHERE user_id = $1 ORDER BY unlocked_at`,
      [user],
    );
    const at = Object.fromEntries(rows.map((r) => [r.code, r.unlocked_at.getTime()]));
    expect(at.FIRST_STEPS).toBe(start);
    expect(at.GETTING_THINGS_DONE).toBe(start + 9 * day); // the 10th task, not the batch time

    // The legacy zone name was normalised before it reached SQL.
    const tz = await h.db.query<{ timezone: string }>('SELECT timezone FROM insights.users WHERE user_id = $1', [user]);
    expect(tz.rows[0]!.timezone).toBe('Asia/Kolkata');
  });
});
