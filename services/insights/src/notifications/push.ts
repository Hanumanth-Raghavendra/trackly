import webpush from 'web-push';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { logger } from '../logger.js';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushSender {
  readonly enabled: boolean;
  readonly publicKey: string | null;
  sendToUser(userId: string, payload: PushPayload): Promise<number>;
}

export const disabledPush: PushSender = {
  enabled: false,
  publicKey: null,
  sendToUser: async () => 0,
};

/**
 * Web Push (VAPID) — free browser notifications even when Trackly isn't open.
 * Disabled unless VAPID keys are configured; dead subscriptions are cleaned up automatically.
 */
export function createPushSender(cfg: Config, db: Db): PushSender {
  if (!cfg.VAPID_PUBLIC_KEY || !cfg.VAPID_PRIVATE_KEY) return disabledPush;
  webpush.setVapidDetails(cfg.VAPID_SUBJECT, cfg.VAPID_PUBLIC_KEY, cfg.VAPID_PRIVATE_KEY);

  return {
    enabled: true,
    publicKey: cfg.VAPID_PUBLIC_KEY,
    async sendToUser(userId, payload) {
      const { rows } = await db.query<{ endpoint: string; p256dh: string; auth: string }>(
        'SELECT endpoint, p256dh, auth FROM insights.push_subscriptions WHERE user_id = $1',
        [userId],
      );
      let sent = 0;
      await Promise.all(
        rows.map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify(payload),
              { TTL: 3600 },
            );
            sent++;
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await db.query('DELETE FROM insights.push_subscriptions WHERE endpoint = $1', [s.endpoint]);
            } else {
              logger.warn({ err, userId }, 'web push failed');
            }
          }
        }),
      );
      return sent;
    },
  };
}
