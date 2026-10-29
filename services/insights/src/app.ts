import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { ZodError } from 'zod';
import { AiDisabledError, AiProviderError, type AiProvider } from './ai/provider.js';
import { problem, requireServiceToken, requireUser, type TokenVerifier } from './auth.js';
import type { Config } from './config.js';
import type { OutboxConsumer } from './consumer/outboxConsumer.js';
import type { Db } from './db.js';
import { logger } from './logger.js';
import type { Notifier } from './notifications/notifier.js';
import type { PushSender } from './notifications/push.js';
import type { ReminderService } from './notifications/reminders.js';
import { aiRouter } from './routes/ai.js';
import { analyticsRouter } from './routes/analytics.js';
import { meRouter } from './routes/me.js';

export interface AppDeps {
  cfg: Config;
  db: Db;
  verify: TokenVerifier;
  ai: AiProvider;
  notifier: Notifier;
  push: PushSender;
  consumer: OutboxConsumer;
  reminders: ReminderService;
}

export function createApp({ cfg, db, verify, ai, notifier, push, consumer, reminders }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: cfg.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  if (cfg.NODE_ENV !== 'test') {
    app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  }

  // --- public ---
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'insights',
      consumer: {
        lastPollAt: consumer.lastPollAt,
        lastError: consumer.lastError,
        processedSinceBoot: consumer.processedTotal,
      },
    });
  });

  /** Feature flags the clients use to show/hide AI and push UI. */
  app.get('/api/v1/insights/config', (_req, res) => {
    res.json({
      ai: { enabled: ai.enabled, provider: ai.name, model: ai.model },
      push: { enabled: push.enabled, vapidPublicKey: push.publicKey },
    });
  });

  // --- service-to-service ---
  const internal = express.Router();
  internal.use(requireServiceToken(cfg.INTERNAL_SERVICE_TOKEN));
  internal.post('/outbox/nudge', (_req, res) => {
    consumer.nudge();
    res.status(202).json({ accepted: true });
  });
  internal.post('/cron/tick', async (_req, res) => {
    await consumer.drain();
    res.json(await reminders.run());
  });
  app.use('/internal', internal);

  // --- authenticated user API ---
  const api = express.Router();
  api.use(requireUser(verify));
  api.use(analyticsRouter(db));
  api.use(meRouter(db, notifier, push));
  api.use('/ai', aiRouter(db, ai));
  app.use('/api/v1/insights', api);

  app.use((_req, res) => {
    res.status(404).json(problem(404, 'NOT_FOUND', 'No such endpoint'));
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json(
        problem(400, 'VALIDATION_FAILED', 'Some fields are invalid', {
          errors: Object.fromEntries(err.issues.map((i) => [i.path.join('.') || 'body', i.message])),
        }),
      );
      return;
    }
    if (err instanceof AiDisabledError) {
      res.status(409).json(problem(409, 'AI_DISABLED', 'AI features are not enabled on this server'));
      return;
    }
    if (err instanceof AiProviderError) {
      logger.warn({ err }, 'AI provider error');
      res.status(502).json(problem(502, 'AI_UNAVAILABLE', 'The AI provider is unavailable, please try again later'));
      return;
    }
    if (err instanceof SyntaxError && 'body' in (err as object)) {
      res.status(400).json(problem(400, 'BAD_REQUEST', 'Malformed JSON'));
      return;
    }
    logger.error({ err }, 'unhandled error');
    res.status(500).json(problem(500, 'INTERNAL_ERROR', 'Something went wrong on our side'));
  });

  return app;
}
