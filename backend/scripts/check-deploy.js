#!/usr/bin/env node
/**
 * Pre-deploy sanity check for the API.
 *
 *   node scripts/check-deploy.js
 *
 * Run it against the environment you are about to deploy with — locally with
 * NODE_ENV=production and the real variables, or inside a Railway shell. It
 * checks the configuration and the database, and says plainly what would
 * break, rather than letting it surface as "login does nothing" in week two.
 */
import { config, validateProductionConfig } from '../src/config.js';
import { closePool, query } from '../src/db.js';

const checks = [];

function record(ok, label, detail) {
  checks.push({ ok, label, detail });
}

const { problems, warnings } = validateProductionConfig();

record(problems.length === 0, 'Configuration', problems.join(' | ') || 'no blocking problems');
for (const warning of warnings) {
  checks.push({ ok: null, label: 'Warning', detail: warning });
}

// Running this in development is not a failure, it just does not describe the
// deployment. Say so instead of reporting a red check nobody can act on.
if (!config.isProduction) {
  console.log(
    `\n  Note: NODE_ENV is "${config.env}". These results describe this environment, not your\n` +
      '  deployment. Run it again with the production variables to check a real deploy.\n'
  );
  checks.push({ ok: null, label: 'NODE_ENV', detail: `${config.env} (not a deployment)` });
} else {
  record(true, 'NODE_ENV', config.env);
}

record(
  config.corsOrigins.length > 0,
  'CORS_ORIGINS',
  config.corsOrigins.join(', ') || 'not set — the browser app cannot call the API'
);
record(
  true,
  'Session cookie',
  `SameSite=${config.session.cookieSameSite}, Secure=${config.isProduction}` +
    (config.session.cookieDomain ? `, Domain=${config.session.cookieDomain}` : ', no domain set')
);

const onPrivateNetwork = config.databaseUrl.includes('.railway.internal');
checks.push(
  config.databaseSsl === false
    ? {
        ok: onPrivateNetwork || !config.isProduction ? true : null,
        label: 'Database TLS',
        detail: onPrivateNetwork
          ? 'off — traffic stays on the private network'
          : 'off, and this is not a private network address',
      }
    : {
        ok: true,
        label: 'Database TLS',
        detail:
          config.databaseSsl?.rejectUnauthorized === false
            ? 'on, certificate not verified'
            : 'on, certificate verified',
      }
);

try {
  const { rows } = await query('SELECT current_database() AS db, version() AS version');
  record(true, 'Database reachable', `${rows[0].db} — ${rows[0].version.split(',')[0]}`);

  const { rows: migrations } = await query(
    `SELECT count(*)::int AS applied FROM schema_migrations`
  ).catch(() => ({ rows: [{ applied: 0 }] }));
  record(
    migrations[0].applied > 0,
    'Migrations applied',
    migrations[0].applied > 0
      ? `${migrations[0].applied}`
      : 'none — run npm run migrate before serving traffic'
  );

  const { rows: admins } = await query(
    `SELECT count(*)::int AS count FROM users WHERE role = 'admin' AND status = 'active'`
  );
  record(
    admins[0].count > 0,
    'Admin account',
    admins[0].count > 0
      ? `${admins[0].count} active`
      : 'none — nobody can verify companies. Run scripts/create-admin.js'
  );

  // A production database full of demo companies is a launch-day surprise.
  const { rows: demo } = await query(
    `SELECT count(*)::int AS count FROM users WHERE email LIKE '%@demo.test'`
  );
  if (config.isProduction && demo[0].count > 0) {
    checks.push({
      ok: false,
      label: 'Seed data',
      detail: `${demo[0].count} demo accounts in a production database`,
    });
  }
} catch (err) {
  record(false, 'Database reachable', err.message);
} finally {
  await closePool();
}

let failed = 0;
for (const check of checks) {
  const mark = check.ok === null ? 'warn' : check.ok ? ' ok ' : 'FAIL';
  if (check.ok === false) failed += 1;
  console.log(`  [${mark}] ${check.label.padEnd(20)} ${check.detail}`);
}

console.log();
if (failed > 0) {
  console.log(`${failed} check(s) failed — not ready to deploy.`);
  process.exit(1);
}
console.log(
  config.isProduction
    ? 'Ready to deploy.'
    : 'This environment is consistent — but it is not a deployment. Re-run with the production variables.'
);
