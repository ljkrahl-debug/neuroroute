import { createApp } from './app.js';
import { config } from './config.js';
import { closePool, pool } from './db.js';
import { deleteExpiredSessions } from './auth/sessions.js';

const app = createApp();

// Fail fast and loudly if the database is not reachable, rather than starting
// and then 500ing on the first request.
try {
  await pool.query('SELECT 1');
} catch (err) {
  console.error(`[startup] cannot reach the database: ${err.message}`);
  process.exit(1);
}

const server = app.listen(config.port, () => {
  console.log(`[startup] Neuroroute API listening on http://localhost:${config.port} (${config.env})`);
});

// Expired rows are also cleaned up as they are encountered, so this is only
// housekeeping to stop the table growing forever.
const sessionSweep = setInterval(
  () => {
    deleteExpiredSessions().catch((err) => console.error('[sessions] sweep failed', err));
  },
  60 * 60 * 1000
);
sessionSweep.unref();

async function shutdown(signal) {
  console.log(`[shutdown] ${signal} received, closing`);
  clearInterval(sessionSweep);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  // Do not let a hung connection keep the process alive forever.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
