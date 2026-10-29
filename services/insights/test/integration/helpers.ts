import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { createApp } from '../../src/app.js';
import { disabledProvider, type AiProvider } from '../../src/ai/provider.js';
import { createTokenVerifier } from '../../src/auth.js';
import { loadConfig } from '../../src/config.js';
import { OutboxConsumer } from '../../src/consumer/outboxConsumer.js';
import { createPool, type Db } from '../../src/db.js';
import { migrate } from '../../src/migrate.js';
import { Notifier } from '../../src/notifications/notifier.js';
import { disabledPush } from '../../src/notifications/push.js';
import { ReminderService } from '../../src/notifications/reminders.js';
import type { Realtime } from '../../src/realtime.js';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/insights_test';
export const SECRET = 'integration-secret-integration-secret-123';
export const SERVICE_TOKEN = 'test-service-token';

/** A realtime fake that records what would have been pushed to sockets. */
export class RecordingRealtime implements Realtime {
  sent: { userId: string; event: string; payload: unknown }[] = [];
  emitToUser(userId: string, event: string, payload: unknown) {
    this.sent.push({ userId, event, payload });
  }
  isOnline() {
    return false;
  }
  connectedCount() {
    return 0;
  }
}

/** Fresh schemas for every test file: a minimal core.outbox_events (owned by core in real life) + insights. */
export async function resetDatabase(db: Db) {
  await db.query('DROP SCHEMA IF EXISTS insights CASCADE');
  await db.query('DROP SCHEMA IF EXISTS core CASCADE');
  await db.query('CREATE SCHEMA core');
  await db.query(`
    CREATE TABLE core.outbox_events (
      id BIGSERIAL PRIMARY KEY,
      event_id UUID NOT NULL DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      aggregate_type VARCHAR(32) NOT NULL,
      aggregate_id UUID NOT NULL,
      event_type VARCHAR(48) NOT NULL,
      payload JSONB NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await migrate(db);
}

export async function publish(db: Db, userId: string, type: string, payload: Record<string, unknown>, at = new Date()) {
  const candidate = String(payload.id ?? payload.habitId ?? userId);
  const aggregateId = /^[0-9a-f-]{36}$/i.test(candidate) ? candidate : randomUUID();
  await db.query(
    `INSERT INTO core.outbox_events (user_id, aggregate_type, aggregate_id, event_type, payload, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, type.split('_')[0], aggregateId, type, JSON.stringify(payload), at],
  );
}

export async function tokenFor(userId: string, tz = 'Asia/Kolkata') {
  return new SignJWT({ email: 'u@test.dev', name: 'Tester', tz })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer('trackly-core')
    .setAudience('trackly')
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(new TextEncoder().encode(SECRET));
}

export function buildHarness(ai: AiProvider = disabledProvider) {
  const cfg = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    JWT_SECRET: SECRET,
    INTERNAL_SERVICE_TOKEN: SERVICE_TOKEN,
  } as NodeJS.ProcessEnv);
  const db = createPool(cfg);
  const realtime = new RecordingRealtime();
  const notifier = new Notifier(db, realtime, disabledPush);
  const consumer = new OutboxConsumer(db, cfg, realtime, notifier);
  const reminders = new ReminderService(db, notifier);
  const app = createApp({
    cfg,
    db,
    verify: createTokenVerifier(SECRET, 'trackly-core'),
    ai,
    notifier,
    push: disabledPush,
    consumer,
    reminders,
  });
  return { cfg, db, realtime, consumer, app, reminders };
}

export const uuid = () => randomUUID();
