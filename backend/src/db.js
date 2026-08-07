import pg from 'pg';
import { config } from './config.js';

// Postgres returns bigint and numeric as strings to avoid precision loss. Money
// is stored as integer cents in bigint columns, which is well inside the safe
// integer range, so parse those back to numbers.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.isTest ? 4 : 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err);
});

export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run a function inside a transaction, rolling back on any throw.
 * The callback receives a client; every query in it must use that client,
 * otherwise it runs on a different connection and outside the transaction.
 */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[db] rollback failed', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
