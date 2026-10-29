import type { Db, Queryable } from '../db.js';
import { logger } from '../logger.js';
import type { Realtime } from '../realtime.js';
import type { PushSender } from './push.js';

export interface NotificationInput {
  type: 'achievement' | 'level_up' | 'habit_reminder' | 'task_due' | 'daily_plan' | 'insight' | 'system';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  push?: boolean;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

/**
 * Notifications are stored first (inside the caller's transaction when there is one) and
 * delivered only after commit — a socket message or push for a row that rolled back would be a lie.
 */
export class Notifier {
  constructor(
    private readonly db: Db,
    private readonly realtime: Realtime,
    private readonly push: PushSender,
  ) {}

  async create(q: Queryable, userId: string, n: NotificationInput): Promise<NotificationRow> {
    const { rows } = await q.query<NotificationRow>(
      `INSERT INTO insights.notifications (user_id, type, title, body, data)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, n.type, n.title, n.body, JSON.stringify(n.data ?? {})],
    );
    return rows[0]!;
  }

  /** Call after the transaction that created `row` has committed. */
  async deliver(row: NotificationRow, opts: { push?: boolean } = {}): Promise<void> {
    this.realtime.emitToUser(row.user_id, 'notification', toDto(row));
    if (opts.push && this.push.enabled) {
      await this.push
        .sendToUser(row.user_id, { title: row.title, body: row.body, url: deepLink(row), tag: row.type })
        .catch((err) => logger.warn({ err }, 'push delivery failed'));
    }
  }

  async notify(userId: string, n: NotificationInput): Promise<NotificationRow> {
    const row = await this.create(this.db, userId, n);
    await this.deliver(row, { push: n.push });
    return row;
  }
}

export function toDto(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data,
    read: row.read_at !== null,
    createdAt: row.created_at,
  };
}

function deepLink(row: NotificationRow): string {
  switch (row.type) {
    case 'habit_reminder':
      return '/app/habits';
    case 'task_due':
    case 'daily_plan':
      return '/app/today';
    case 'achievement':
    case 'level_up':
      return '/app/achievements';
    default:
      return '/app';
  }
}
