import type { Db } from '../db.js';
import { logger } from '../logger.js';
import type { Notifier } from './notifier.js';

/** How long after its time a reminder may still go out (covers a sleeping server or a late cron). */
export const REMINDER_WINDOW_MINUTES = 60;
/** How often an awake server checks. Rare on purpose: each check wakes the free database. */
export const REMINDER_INTERVAL_MS = 10 * 60_000;

/**
 * Server-side reminders: habit nudges, "due within the hour" and a morning plan.
 *
 * They run every 10 minutes while the service is awake, and an external free cron (GitHub
 * Actions, hourly) wakes the service through POST /internal/cron/tick. Each reminder has a
 * 60-minute window and is logged once per day, so a late tick still delivers and a second tick
 * never duplicates. The mobile app ALSO schedules habit reminders as on-device notifications,
 * which fire on the minute with no server at all.
 *
 * `now` is a parameter so the windows (including ones that cross midnight) are testable.
 */
export class ReminderService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Db,
    private readonly notifier: Notifier,
  ) {}

  start(intervalMs = REMINDER_INTERVAL_MS) {
    this.timer = setInterval(() => void this.run().catch((err) => logger.error({ err }, 'reminders failed')), intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(now: Date = new Date()): Promise<{ habits: number; tasks: number; plans: number }> {
    const habits = await this.habitReminders(now);
    const tasks = await this.dueSoon(now);
    const plans = await this.dailyPlans(now);
    if (habits + tasks + plans > 0) logger.info({ habits, tasks, plans }, 'sent reminders');
    return { habits, tasks, plans };
  }

  /**
   * "Time for Read 20 pages", within the window after the habit's reminder time, unless it's
   * already done that day. The reminder "day" is the local date the reminder time fell on, so a
   * 23:45 reminder checked at 00:20 still belongs to the previous day.
   */
  private async habitReminders(now: Date): Promise<number> {
    const { rows } = await this.db.query<{ user_id: string; habit_id: string; name: string; icon: string | null }>(
      `WITH local AS (
         SELECT h.user_id, h.habit_id, h.reminder_time, h.frequency_type, h.days_of_week,
                ($1::timestamptz AT TIME ZONE u.timezone) AS local_now
           FROM insights.habits h JOIN insights.users u USING (user_id)
          WHERE NOT h.archived AND h.reminder_time IS NOT NULL
       ), fired AS (
         SELECT *, CASE WHEN local_now::time >= reminder_time THEN local_now::date
                        ELSE local_now::date - 1 END AS day
           FROM local
       ), due AS (
         SELECT user_id, habit_id, day FROM fired
          WHERE local_now - (day + reminder_time) < make_interval(mins => $2)
            AND (frequency_type <> 'SPECIFIC_DAYS'
                 OR (days_of_week & (1 << (extract(isodow FROM day)::int - 1))) <> 0)
            AND NOT EXISTS (SELECT 1 FROM insights.habit_checkins c
                             WHERE c.habit_id = fired.habit_id AND c.day = fired.day)
       ), logged AS (
         INSERT INTO insights.reminder_log (user_id, kind, ref, day)
         SELECT user_id, 'habit', habit_id::text, day FROM due
         ON CONFLICT DO NOTHING
         RETURNING user_id, ref
       )
       SELECT l.user_id, h.habit_id, h.name, h.icon
         FROM logged l JOIN insights.habits h ON h.habit_id = l.ref::uuid`,
      [now, REMINDER_WINDOW_MINUTES],
    );
    for (const r of rows) {
      await this.notifier.notify(r.user_id, {
        type: 'habit_reminder',
        title: `${r.icon ?? '⏰'} Time for ${r.name}`,
        body: 'A quick check-in keeps your streak alive.',
        data: { habitId: r.habit_id },
        push: true,
      });
    }
    return rows.length;
  }

  /** Tasks due within the next hour (once per task per day). */
  private async dueSoon(now: Date): Promise<number> {
    const { rows } = await this.db.query<{ user_id: string; task_id: string; title: string }>(
      `WITH logged AS (
         INSERT INTO insights.reminder_log (user_id, kind, ref, day)
         SELECT t.user_id, 'task_due', t.task_id::text, ($1::timestamptz AT TIME ZONE u.timezone)::date
           FROM insights.tasks t JOIN insights.users u USING (user_id)
          WHERE t.completed_at IS NULL AND t.status <> 'DONE'
            AND t.due_at > $1::timestamptz AND t.due_at <= $1::timestamptz + interval '60 minutes'
         ON CONFLICT DO NOTHING
         RETURNING user_id, ref
       )
       SELECT l.user_id, t.task_id, t.title FROM logged l JOIN insights.tasks t ON t.task_id = l.ref::uuid`,
      [now],
    );
    for (const r of rows) {
      await this.notifier.notify(r.user_id, {
        type: 'task_due',
        title: '⏳ Due within the hour',
        body: r.title,
        data: { taskId: r.task_id },
        push: true,
      });
    }
    return rows.length;
  }

  /** A morning plan between 08:00 and 09:00 local time for users with something on their plate. */
  private async dailyPlans(now: Date): Promise<number> {
    const { rows } = await this.db.query<{ user_id: string; due_count: number; habit_count: number }>(
      `WITH candidates AS (
         SELECT u.user_id, ($1::timestamptz AT TIME ZONE u.timezone)::date AS day, u.timezone
           FROM insights.users u
          WHERE NOT u.demo
            AND ($1::timestamptz AT TIME ZONE u.timezone)::time >= '08:00'
            AND ($1::timestamptz AT TIME ZONE u.timezone)::time < '08:00'::time + make_interval(mins => $2)
       ), counts AS (
         SELECT c.user_id, c.day,
           (SELECT count(*) FROM insights.tasks t WHERE t.user_id = c.user_id AND t.completed_at IS NULL
               AND (t.due_at AT TIME ZONE c.timezone)::date = c.day)::int AS due_count,
           (SELECT count(*) FROM insights.habits h WHERE h.user_id = c.user_id AND NOT h.archived)::int AS habit_count
           FROM candidates c
       ), logged AS (
         INSERT INTO insights.reminder_log (user_id, kind, ref, day)
         SELECT user_id, 'daily_plan', 'plan', day FROM counts WHERE due_count + habit_count > 0
         ON CONFLICT DO NOTHING
         RETURNING user_id
       )
       SELECT c.user_id, c.due_count, c.habit_count FROM counts c JOIN logged l USING (user_id)`,
      [now, REMINDER_WINDOW_MINUTES],
    );
    for (const r of rows) {
      await this.notifier.notify(r.user_id, {
        type: 'daily_plan',
        title: '☀️ Your plan for today',
        body: `${r.due_count} task${r.due_count === 1 ? '' : 's'} due and ${r.habit_count} habit${r.habit_count === 1 ? '' : 's'} to keep. Start with the hardest one.`,
        push: true,
      });
    }
    return rows.length;
  }
}
