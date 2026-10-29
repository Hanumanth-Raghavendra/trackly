import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { ACHIEVEMENTS, levelProgress } from '../domain/gamification.js';
import { toDto, type NotificationRow, type Notifier } from '../notifications/notifier.js';
import type { PushSender } from '../notifications/push.js';

/** Per-user state owned by insights: gamification, notifications and push subscriptions. */
export function meRouter(db: Db, notifier: Notifier, push: PushSender) {
  const r = Router();

  r.get('/gamification', async (req, res) => {
    const userId = req.user!.id;
    const [stats, unlocked, recent] = await Promise.all([
      db.query<{ xp: number }>('SELECT xp FROM insights.user_stats WHERE user_id = $1', [userId]),
      db.query<{ code: string; unlocked_at: Date }>(
        'SELECT code, unlocked_at FROM insights.achievements WHERE user_id = $1',
        [userId],
      ),
      db.query<{ reason: string; delta: number; earned_at: Date }>(
        `SELECT reason, delta, earned_at FROM insights.xp_ledger WHERE user_id = $1
          ORDER BY earned_at DESC LIMIT 15`,
        [userId],
      ),
    ]);
    const unlockedAt = new Map(unlocked.rows.map((u) => [u.code, u.unlocked_at]));
    res.json({
      ...levelProgress(stats.rows[0]?.xp ?? 0),
      achievements: ACHIEVEMENTS.map(({ test: _test, ...a }) => ({
        ...a,
        unlockedAt: unlockedAt.get(a.code) ?? null,
      })),
      recentXp: recent.rows.map((x) => ({ reason: x.reason, delta: x.delta, at: x.earned_at })),
    });
  });

  r.get('/notifications', async (req, res) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(req.query);
    const userId = req.user!.id;
    const [list, unread] = await Promise.all([
      db.query<NotificationRow>(
        'SELECT * FROM insights.notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
        [userId, limit],
      ),
      db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM insights.notifications WHERE user_id = $1 AND read_at IS NULL',
        [userId],
      ),
    ]);
    res.json({ items: list.rows.map(toDto), unread: unread.rows[0]?.n ?? 0 });
  });

  r.post('/notifications/read', async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.uuid()).max(200).optional() }).parse(req.body ?? {});
    const userId = req.user!.id;
    if (ids?.length) {
      await db.query(
        'UPDATE insights.notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL',
        [userId, ids],
      );
    } else {
      await db.query('UPDATE insights.notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
    }
    res.status(204).end();
  });

  r.delete('/notifications', async (req, res) => {
    await db.query('DELETE FROM insights.notifications WHERE user_id = $1', [req.user!.id]);
    res.status(204).end();
  });

  const subscription = z.object({
    endpoint: z.url().max(1000),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  });

  r.post('/push/subscriptions', async (req, res) => {
    if (!push.enabled) {
      res.status(409).json({ code: 'PUSH_DISABLED', detail: 'Push notifications are not configured on this server' });
      return;
    }
    const sub = subscription.parse(req.body);
    await db.query(
      `INSERT INTO insights.push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [sub.endpoint, req.user!.id, sub.keys.p256dh, sub.keys.auth, String(req.headers['user-agent'] ?? '').slice(0, 255)],
    );
    res.status(201).json({ subscribed: true });
  });

  r.delete('/push/subscriptions', async (req, res) => {
    const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(req.body ?? {});
    await db.query('DELETE FROM insights.push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.user!.id]);
    res.status(204).end();
  });

  r.post('/push/test', async (req, res) => {
    await notifier.notify(req.user!.id, {
      type: 'system',
      title: '🔔 Notifications are on',
      body: "You'll get habit reminders and due-soon alerts here.",
      push: true,
    });
    res.status(202).json({ queued: true });
  });

  return r;
}
