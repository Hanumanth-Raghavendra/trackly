import type { Config } from '../config.js';
import { withTransaction, type Db } from '../db.js';
import { levelProgress } from '../domain/gamification.js';
import { logger } from '../logger.js';
import type { NotificationRow, Notifier } from '../notifications/notifier.js';
import type { Realtime } from '../realtime.js';
import { applyEvent, type OutboxEvent } from './handlers.js';
import { refreshStats, unlockAchievements } from './gamificationService.js';

/** Events older than this are history (e.g. demo seeding): no toasts, pushes or notifications. */
const LIVE_WINDOW_MS = 10 * 60 * 1000;
const CONSUMER = 'outbox';
const LOCK_KEY = 7311002;

interface Touched {
  entities: Set<string>;
  xpGained: number;
  lastAt: Date;
  live: boolean;
  deleted: boolean;
}

interface Effect {
  userId: string;
  event: string;
  payload: unknown;
}

/**
 * Pulls events from core.outbox_events in id order and applies them to the insights read model.
 *
 *  - Exactly-once *effects*: offset and projection updates commit in the same transaction, and
 *    every handler is idempotent, so a crash at any point just replays harmlessly.
 *  - Single active consumer: a transaction-scoped advisory lock (works through PgBouncer too).
 *  - Poison events are parked in insights.dead_letters instead of blocking the stream.
 *  - Socket messages, pushes and notifications go out only after commit.
 *  - Adaptive polling: fast right after activity, slow when idle, instant on a nudge from core.
 */
export class OutboxConsumer {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = true;
  private pendingNudge = false;
  private idleRounds = 0;
  lastError: string | null = null;
  lastPollAt: Date | null = null;
  processedTotal = 0;

  constructor(
    private readonly db: Db,
    private readonly cfg: Pick<Config, 'OUTBOX_BATCH_SIZE' | 'POLL_ACTIVE_MS' | 'POLL_IDLE_MS'>,
    private readonly realtime: Realtime,
    private readonly notifier: Notifier,
  ) {}

  start() {
    this.stopped = false;
    this.schedule(0);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Called when core tells us new events exist. */
  nudge() {
    this.idleRounds = 0;
    if (this.running) {
      this.pendingNudge = true;
      return;
    }
    this.schedule(0);
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private nextDelay(): number {
    // Nobody watching and nothing happening: poll rarely (core's nudge wakes us when needed),
    // which also lets the free Neon database scale to zero.
    if (this.realtime.connectedCount() === 0 && this.idleRounds > 5) return this.cfg.POLL_IDLE_MS;
    return Math.min(this.cfg.POLL_ACTIVE_MS * 1.5 ** this.idleRounds, 30_000);
  }

  private async tick() {
    this.running = true;
    let processed = 0;
    try {
      // Drain everything available (bounded so one tick can't run forever).
      for (let i = 0; i < 50; i++) {
        const n = await this.pollOnce();
        processed += n;
        if (n < this.cfg.OUTBOX_BATCH_SIZE) break;
      }
      this.lastError = null;
    } catch (err) {
      const code = (err as { code?: string }).code;
      this.lastError = (err as Error).message;
      if (code === '42P01') logger.warn('core.outbox_events does not exist yet (core API not migrated?) - retrying');
      else logger.error({ err }, 'outbox poll failed');
    } finally {
      this.running = false;
      this.lastPollAt = new Date();
    }
    this.idleRounds = processed > 0 ? 0 : this.idleRounds + 1;
    if (this.pendingNudge) {
      this.pendingNudge = false;
      this.schedule(0);
    } else {
      this.schedule(this.nextDelay());
    }
  }

  /** Processes at most one batch. Returns the number of events consumed. */
  async pollOnce(): Promise<number> {
    const effects: Effect[] = [];
    const notifications: { row: NotificationRow; push: boolean }[] = [];

    const count = await withTransaction(this.db, async (tx) => {
      const lock = await tx.query<{ ok: boolean }>('SELECT pg_try_advisory_xact_lock($1) AS ok', [LOCK_KEY]);
      if (!lock.rows[0]?.ok) return 0;

      const offset = await tx.query<{ last_event_id: number }>(
        'SELECT last_event_id FROM insights.consumer_offsets WHERE consumer = $1 FOR UPDATE',
        [CONSUMER],
      );
      const after = offset.rows[0]?.last_event_id ?? 0;
      const { rows: events } = await tx.query<OutboxEvent>(
        `SELECT id, event_id, user_id, aggregate_type, aggregate_id, event_type, payload, occurred_at
           FROM core.outbox_events WHERE id > $1 ORDER BY id LIMIT $2`,
        [after, this.cfg.OUTBOX_BATCH_SIZE],
      );
      if (events.length === 0) return 0;

      const touched = new Map<string, Touched>();
      const now = Date.now();
      for (const e of events) {
        await tx.query('SAVEPOINT ev');
        try {
          const result = await applyEvent(tx, e);
          await tx.query('RELEASE SAVEPOINT ev');
          const t = touched.get(e.user_id) ?? {
            entities: new Set<string>(),
            xpGained: 0,
            lastAt: e.occurred_at,
            live: false,
            deleted: false,
          };
          if (result.entity) t.entities.add(result.entity);
          if (result.userDeleted) t.deleted = true;
          const live = now - e.occurred_at.getTime() < LIVE_WINDOW_MS;
          if (live) {
            t.live = true;
            if (result.xp) {
              t.xpGained += result.xp.delta;
              effects.push({ userId: e.user_id, event: 'xp', payload: result.xp });
            }
          }
          if (e.occurred_at > t.lastAt) t.lastAt = e.occurred_at;
          touched.set(e.user_id, t);
        } catch (err) {
          await tx.query('ROLLBACK TO SAVEPOINT ev');
          logger.error({ err, eventId: e.id, type: e.event_type }, 'event failed - moved to dead letters');
          await tx.query(
            `INSERT INTO insights.dead_letters (event_id, event_type, payload, error) VALUES ($1, $2, $3, $4)
             ON CONFLICT (event_id) DO NOTHING`,
            [e.id, e.event_type, JSON.stringify(e.payload), (err as Error).message.slice(0, 1000)],
          );
        }
      }

      // Per-user follow-up: XP/level, achievements, notifications, live sync messages.
      for (const [userId, t] of touched) {
        if (t.deleted) continue;
        const stats = await refreshStats(tx, userId);
        const unlocked = await unlockAchievements(tx, userId, stats.level, t.lastAt);
        if (t.live) {
          if (stats.level > stats.previousLevel) {
            const row = await this.notifier.create(tx, userId, {
              type: 'level_up',
              title: `Level ${stats.level} reached!`,
              body: `You're now a ${levelProgress(stats.xp).title}. Keep the momentum going.`,
              data: { level: stats.level },
            });
            notifications.push({ row, push: true });
            effects.push({ userId, event: 'level_up', payload: levelProgress(stats.xp) });
          }
          for (const a of unlocked) {
            const row = await this.notifier.create(tx, userId, {
              type: 'achievement',
              title: `${a.icon} Achievement unlocked: ${a.title}`,
              body: a.description,
              data: { code: a.code },
            });
            notifications.push({ row, push: true });
            effects.push({ userId, event: 'achievement', payload: { code: a.code, title: a.title, description: a.description, icon: a.icon, tier: a.tier } });
          }
        }
        effects.push({ userId, event: 'sync', payload: { entities: [...t.entities, 'insights'] } });
        effects.push({ userId, event: 'stats', payload: levelProgress(stats.xp) });
      }

      await tx.query('UPDATE insights.consumer_offsets SET last_event_id = $1, updated_at = now() WHERE consumer = $2', [
        events[events.length - 1]!.id,
        CONSUMER,
      ]);
      return events.length;
    });

    // Side effects strictly after commit.
    for (const e of effects) this.realtime.emitToUser(e.userId, e.event, e.payload);
    for (const n of notifications) await this.notifier.deliver(n.row, { push: n.push });
    this.processedTotal += count;
    if (count > 0) logger.debug({ count }, 'processed outbox events');
    return count;
  }

  /** Processes until the outbox is drained (used at startup and in tests). */
  async drain(): Promise<number> {
    let total = 0;
    for (;;) {
      const n = await this.pollOnce();
      total += n;
      if (n === 0) return total;
    }
  }
}
