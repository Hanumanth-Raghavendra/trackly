import pg from 'pg';
import type { Config } from './config.js';

// Return BIGINT/NUMERIC aggregates as JS numbers (our counts are far below 2^53)
// and DATE columns as plain 'YYYY-MM-DD' strings (no accidental timezone shifts).
pg.types.setTypeParser(20, (v) => Number(v)); // int8
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric
pg.types.setTypeParser(1082, (v) => v); // date

export type Db = pg.Pool;
export type Tx = pg.PoolClient;
export type Queryable = Pick<pg.Pool, 'query'>;

export function createPool(cfg: Pick<Config, 'DATABASE_URL' | 'DB_POOL_SIZE'>): Db {
  return new pg.Pool({
    connectionString: cfg.DATABASE_URL,
    max: cfg.DB_POOL_SIZE,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 20_000,
    // Every connection works in UTC; per-user timezones are applied explicitly in SQL.
    options: '-c timezone=UTC',
  });
}

/**
 * Runs independent queries concurrently on a pool, but sequentially on a single client
 * (a pg client can only run one query at a time; queuing on it is deprecated).
 */
export async function parallel<T extends readonly unknown[]>(
  q: Queryable,
  fns: { [K in keyof T]: () => Promise<T[K]> },
): Promise<T> {
  if (q instanceof pg.Pool) {
    return (await Promise.all(fns.map((f) => f()))) as unknown as T;
  }
  const out: unknown[] = [];
  for (const f of fns) out.push(await f());
  return out as unknown as T;
}

/** Runs `fn` inside a transaction, committing on success and rolling back on any error. */
export async function withTransaction<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
