import type { Db } from '../db.js';
import { logger } from '../logger.js';
import type { Notifier } from './notifier.js';

/**
 * Server-side reminders. They run every minute while the service is awake, and can also be
 * triggered by an external free cron (GitHub Actions) via POST /internal/cron/tick.
 *
 * Note: on the free tier the service sleeps when idle, so the mobile app ALSO schedules habit
 * reminders as on-device local notifications, which work with no server at all.
 */
export class ReminderService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Db,
    private readonly notifier: Notifier,
  ) {}

  start(intervalMs = 60_000) {
    this.timer = setInterval(() => void this.run().catch((err) => logger.error({ err }, 'reminders failed')), intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<{ habits: number; tasks: number; plans: number }> {
    const [habits, tasks, plans] = [await this.habitReminders(), await this.dueSoon(), await this.dailyPlans()];
    if (habits + tasks + plans > 0) logger.info({ habits, tasks, plans }, 'sent reminders');
    return { habits, tasks, plans };
  }

  /** "Time for Read 20 pages" — in a 30-minute window after the habit's reminder time. */
  private async habitReminders(): Promise<number> {
    const { rows } = await this.db.query<{ user_id: string; habit_id: string; name: string; icon: string | null; day: string }>(
      `WITH due AS (
         SELECT h.user_id, h.habit_id, h.name, h.icon, (now() AT TIME ZONE u.timezone)::date AS day
           FROM insights.habits h JOIN insights.users u USING (user_id)
          WHERE NOT h.archived AND h.reminder_time IS NOT NULL
            AND (now() AT TIME ZONE u.timezone)::time >= h.reminder_time
            AND (now() AT TIME ZONE u.timezone)::time < h.reminder_time + interval '30 minutes'
            AND (h.frequency_type <> 'SPECIFIC_DAYS'
                 OR (h.days_of_week & (1 << (extract(isodow FROM now() AT TIME ZONE u.timezone)::int - 1))) <> 0)
       )
       INSERT INTO insights.reminder_log (user_id, kind, ref, day)
       SELECT d.user_id, 'habit', d.habit_id::text, d.day FROM due d
        WHERE NOT EXISTS (SELECT 1 FROM insights.habit_checkins c WHERE c.habit_id = d.habit_id AND c.day = d.day)
       ON CONFLICT DO NOTHING
       RETURNING user_id, ref AS habit_id,
         (SELECT name FROM insights.habits WHERE habit_id = ref::uuid) AS name,
         (SELECT icon FROM insights.habits WHERE habit_id = ref::uuid) AS icon, day`,
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
  private async dueSoon(): Promise<number> {
    const { rows } = await this.db.query<{ user_id: string; task_id: string; title: string }>(
      `INSERT INTO insights.reminder_log (user_id, kind, ref, day)
       SELECT t.user_id, 'task_due', t.task_id::text, (now() AT TIME ZONE u.timezone)::date
         FROM insights.tasks t JOIN insights.users u USING (user_id)
        WHERE t.completed_at IS NULL AND t.status <> 'DONE'
          AND t.due_at > now() AND t.due_at <= now() + interval '60 minutes'
       ON CONFLICT DO NOTHING
       RETURNING user_id, ref AS task_id, (SELECT title FROM insights.tasks WHERE task_id = ref::uuid) AS title`,
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

  /** A morning plan between 8:00 and 8:30 local time for users with something on their plate. */
  private async dailyPlans(): Promise<number> {
    const { rows } = await this.db.query<{ user_id: string; due_count: number; habit_count: number }>(
      `WITH candidates AS (
         SELECT u.user_id, (now() AT TIME ZONE u.timezone)::date AS day, u.timezone
           FROM insights.users u
          WHERE NOT u.demo
            AND (now() AT TIME ZONE u.timezone)::time BETWEEN '08:00' AND '08:30'
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
