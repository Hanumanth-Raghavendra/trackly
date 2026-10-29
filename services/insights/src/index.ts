import { createServer } from 'node:http';
import { createApp } from './app.js';
import { createAiProvider } from './ai/provider.js';
import { createTokenVerifier } from './auth.js';
import { loadConfig } from './config.js';
import { OutboxConsumer } from './consumer/outboxConsumer.js';
import { createPool } from './db.js';
import { setDatabaseZones } from './domain/dates.js';
import { logger } from './logger.js';
import { migrate } from './migrate.js';
import { Notifier } from './notifications/notifier.js';
import { createPushSender } from './notifications/push.js';
import { ReminderService } from './notifications/reminders.js';
import { attachRealtime, type Realtime } from './realtime.js';

async function main() {
  const cfg = loadConfig();
  const db = createPool(cfg);
  await migrate(db);
  // Only hand Postgres zone names it knows (its tzdata can lag behind Node's).
  const zones = await db.query<{ name: string }>('SELECT name FROM pg_timezone_names');
  setDatabaseZones(zones.rows.map((r) => r.name));

  const verify = createTokenVerifier(cfg.JWT_SECRET, cfg.JWT_ISSUER);
  const ai = createAiProvider(cfg);
  const push = createPushSender(cfg, db);

  // The realtime layer needs the HTTP server, and the app needs the consumer that needs realtime,
  // so wire them through a small forwarding object.
  let realtimeImpl: Realtime | null = null;
  const realtime: Realtime = {
    emitToUser: (u, e, p) => realtimeImpl?.emitToUser(u, e, p),
    isOnline: (u) => realtimeImpl?.isOnline(u) ?? false,
    connectedCount: () => realtimeImpl?.connectedCount() ?? 0,
  };

  const notifier = new Notifier(db, realtime, push);
  const consumer = new OutboxConsumer(db, cfg, realtime, notifier);
  const reminders = new ReminderService(db, notifier);
  const app = createApp({ cfg, db, verify, ai, notifier, push, consumer, reminders });

  const server = createServer(app);
  realtimeImpl = attachRealtime(server, verify, cfg.corsOrigins).realtime;

  server.listen(cfg.PORT, () => {
    logger.info({ port: cfg.PORT, ai: ai.name, push: push.enabled }, 'insights service listening');
  });

  consumer.start();
  if (cfg.REMINDERS_ENABLED) reminders.start();

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    consumer.stop();
    reminders.stop();
    server.close(() => void db.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
