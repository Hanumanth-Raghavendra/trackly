import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTransaction, type Db } from './db.js';
import { logger } from './logger.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * A tiny forward-only migration runner: applies migrations/NNN_name.sql files in order, each in
 * its own transaction, and records them in insights.schema_migrations. An advisory lock makes it
 * safe if two instances boot at the same time.
 */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const applied: string[] = [];

  await withTransaction(db, async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(7311001)');
    await tx.query('CREATE SCHEMA IF NOT EXISTS insights');
    await tx.query(
      `CREATE TABLE IF NOT EXISTS insights.schema_migrations (
         version TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    const done = new Set(
      (await tx.query<{ version: string }>('SELECT version FROM insights.schema_migrations')).rows.map(
        (r) => r.version,
      ),
    );
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(dir, file), 'utf8');
      await tx.query(sql);
      await tx.query('INSERT INTO insights.schema_migrations (version) VALUES ($1)', [file]);
      applied.push(file);
      logger.info({ migration: file }, 'applied migration');
    }
  });
  return applied;
}
