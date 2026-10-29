import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildHarness, publish, resetDatabase, uuid } from './helpers.js';

const h = buildHarness();

beforeAll(async () => {
  await resetDatabase(h.db);
});

afterAll(async () => {
  await h.db.end();
});

beforeEach(async () => {
  await h.db.query('DELETE FROM insights.reminder_log');
  await h.db.query('DELETE FROM insights.notifications');
  h.realtime.sent = [];
});

/** A user in Asia/Kolkata (UTC+5:30) with one habit reminded at `time`. */
async function userWithHabit(time: string, extra: Record<string, unknown> = {}) {
  const userId = uuid();
  const habitId = uuid();
  await publish(h.db, userId, 'USER_REGISTERED', {
    id: userId,
    email: `${userId}@test.dev`,
    displayName: 'Reminder tester',
    timezone: 'Asia/Kolkata',
    focusGoalMinutes: 60,
    demo: false,
    createdAt: '2026-01-01T00:00:00Z',
  });
  await publish(h.db, userId, 'HABIT_CREATED', {
    id: habitId,
    name: 'Read 20 pages',
    icon: '📚',
    color: '#4361ee',
    frequencyType: 'DAILY',
    targetPerWeek: 7,
    daysOfWeek: 127,
    reminderTime: time,
    goalId: null,
    archived: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...extra,
  });
  await h.consumer.drain();
  return { userId, habitId };
}

const habitReminders = (userId: string) =>
  h.realtime.sent.filter((s) => s.userId === userId && (s.payload as { type?: string }).type === 'habit_reminder');

describe('ReminderService', () => {
  it('reminds once inside the window, and never twice', async () => {
    const { userId } = await userWithHabit('21:30');
    // 21:40 in Kolkata = 16:10 UTC.
    await h.reminders.run(new Date('2026-03-10T16:10:00Z'));
    expect(habitReminders(userId)).toHaveLength(1);

    await h.reminders.run(new Date('2026-03-10T16:20:00Z'));
    expect(habitReminders(userId)).toHaveLength(1);
  });

  it('does not remind before the time or after the window', async () => {
    const { userId } = await userWithHabit('21:30');
    await h.reminders.run(new Date('2026-03-10T15:50:00Z')); // 21:20 local, too early
    await h.reminders.run(new Date('2026-03-10T17:10:00Z')); // 22:40 local, window closed
    expect(habitReminders(userId)).toHaveLength(0);
  });

  it('handles a late-night reminder whose window crosses midnight', async () => {
    const { userId, habitId } = await userWithHabit('23:45');
    // 00:20 local on 11 March = 18:50 UTC on 10 March: still the 10 March reminder.
    await h.reminders.run(new Date('2026-03-10T18:50:00Z'));
    expect(habitReminders(userId)).toHaveLength(1);
    const { rows } = await h.db.query<{ day: string }>(
      "SELECT day FROM insights.reminder_log WHERE ref = $1 AND kind = 'habit'",
      [habitId],
    );
    expect(rows[0]?.day).toBe('2026-03-10');
  });

  it('skips habits already checked in for that day', async () => {
    const { userId, habitId } = await userWithHabit('07:00');
    await publish(h.db, userId, 'HABIT_CHECKED', {
      habitId,
      date: '2026-03-10',
      mood: null,
      freeze: false,
      checkedAt: '2026-03-10T01:00:00Z',
    });
    await h.consumer.drain();
    await h.reminders.run(new Date('2026-03-10T01:45:00Z')); // 07:15 local
    expect(habitReminders(userId)).toHaveLength(0);
  });

  it('respects specific-day schedules', async () => {
    // Mondays only (bitmask 1); 10 March 2026 is a Tuesday.
    const { userId } = await userWithHabit('07:00', { frequencyType: 'SPECIFIC_DAYS', daysOfWeek: 1, targetPerWeek: 1 });
    await h.reminders.run(new Date('2026-03-10T01:45:00Z'));
    expect(habitReminders(userId)).toHaveLength(0);
    await h.reminders.run(new Date('2026-03-09T01:45:00Z')); // Monday
    expect(habitReminders(userId)).toHaveLength(1);
  });
});
