import { z } from 'zod';

/**
 * All configuration comes from environment variables, validated once at startup so a typo
 * fails fast with a readable message instead of a mysterious runtime error.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1).default('postgres://postgres:postgres@localhost:5432/trackly'),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(20).default(5),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters (and identical to the core API)')
    .default('dev-only-secret-change-me-dev-only-secret-change-me'),
  JWT_ISSUER: z.string().default('trackly-core'),
  INTERNAL_SERVICE_TOKEN: z.string().min(8).default('dev-internal-token'),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:4173,https://localhost,capacitor://localhost'),

  // Outbox consumer
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(10).max(2000).default(500),
  POLL_ACTIVE_MS: z.coerce.number().int().min(200).default(2_000),
  POLL_IDLE_MS: z.coerce.number().int().min(1_000).default(600_000),

  // AI (optional, provider-agnostic). "none" keeps everything rule-based and free.
  AI_PROVIDER: z.enum(['none', 'gemini', 'openai', 'anthropic']).default('none'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_BASE_URL: z.string().optional(),

  // Web Push (optional, free): generate keys with `npm run vapid`.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@trackly.local'),

  REMINDERS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Config = z.infer<typeof schema> & { corsOrigins: string[] };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const cfg = parsed.data;
  if (cfg.AI_PROVIDER !== 'none' && !cfg.AI_API_KEY && cfg.AI_PROVIDER !== 'openai') {
    throw new Error(`AI_PROVIDER=${cfg.AI_PROVIDER} needs AI_API_KEY`);
  }
  return {
    ...cfg,
    corsOrigins: cfg.CORS_ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  };
}
