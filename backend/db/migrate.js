#!/usr/bin/env node
/**
 * Minimal forward-only migration runner.
 *
 *   node db/migrate.js           apply everything not yet applied
 *   node db/migrate.js --reset   drop the schema first (development only)
 *   node db/migrate.js --status  list applied and pending migrations
 *
 * Each file in db/migrations runs inside its own transaction, so a failing
 * migration leaves nothing half applied. Applied files are recorded with a
 * checksum: editing a migration that already ran is a mistake worth catching,
 * because other environments will never see the edit.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool, closePool } from '../src/db.js';
import { config } from '../src/config.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

function checksum(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function loadMigrations() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  return Promise.all(
    files.map(async (name) => {
      const sql = await readFile(join(MIGRATIONS_DIR, name), 'utf8');
      return { name, sql, checksum: checksum(sql) };
    })
  );
}

async function reset(client) {
  if (config.isProduction) {
    throw new Error('Refusing to reset the schema with NODE_ENV=production');
  }
  console.log('[migrate] dropping schema public');
  await client.query('DROP SCHEMA public CASCADE');
  await client.query('CREATE SCHEMA public');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const client = await pool.connect();

  try {
    if (args.has('--reset')) {
      await reset(client);
    }
    await ensureMigrationsTable(client);

    const { rows: appliedRows } = await client.query('SELECT name, checksum FROM schema_migrations');
    const applied = new Map(appliedRows.map((r) => [r.name, r.checksum]));
    const migrations = await loadMigrations();

    if (args.has('--status')) {
      for (const m of migrations) {
        const state = applied.has(m.name) ? 'applied' : 'pending';
        console.log(`  ${state.padEnd(8)} ${m.name}`);
      }
      return;
    }

    for (const [name, storedChecksum] of applied) {
      const current = migrations.find((m) => m.name === name);
      if (current && current.checksum !== storedChecksum) {
        throw new Error(
          `Migration ${name} changed after it was applied. Add a new migration instead of editing it.`
        );
      }
    }

    const pending = migrations.filter((m) => !applied.has(m.name));
    if (pending.length === 0) {
      console.log('[migrate] nothing to do, database is up to date');
      return;
    }

    for (const migration of pending) {
      process.stdout.write(`[migrate] applying ${migration.name} … `);
      try {
        await client.query('BEGIN');
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
          migration.name,
          migration.checksum,
        ]);
        await client.query('COMMIT');
        console.log('ok');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('failed');
        throw err;
      }
    }
    console.log(`[migrate] applied ${pending.length} migration(s)`);
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((err) => {
  console.error('[migrate]', err.message);
  process.exit(1);
});
