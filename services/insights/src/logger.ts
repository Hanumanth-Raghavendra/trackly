import { pino } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { service: 'insights' },
  redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-service-token"]'],
});

export type Logger = typeof logger;
