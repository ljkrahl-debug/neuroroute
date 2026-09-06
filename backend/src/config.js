import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

const env = process.env.NODE_ENV ?? 'development';
const isProduction = env === 'production';

/**
 * How to talk TLS to Postgres.
 *
 *   auto      (default) no TLS on Railway's private network, TLS otherwise
 *   disable   plain connection — only sane locally
 *   no-verify TLS, but the server certificate is not verified. Railway's public
 *             database proxy presents a self-signed certificate, so this is the
 *             only way to reach it. It protects against passive eavesdropping
 *             but not against an active man in the middle, which is why the
 *             private network is the recommended route.
 */
function resolveDatabaseSsl(databaseUrl) {
  const mode = process.env.DATABASE_SSL ?? 'auto';
  const onPrivateNetwork = databaseUrl.includes('.railway.internal');

  if (mode === 'disable') return false;
  if (mode === 'no-verify') return { rejectUnauthorized: false };
  if (mode === 'require') return true;
  if (mode !== 'auto') {
    throw new Error(`DATABASE_SSL must be auto, disable, require or no-verify (got "${mode}")`);
  }

  if (onPrivateNetwork) return false;
  if (!isProduction) return false;
  return { rejectUnauthorized: false };
}

const databaseUrl = required('DATABASE_URL');

const cookieSameSite = (process.env.COOKIE_SAMESITE ?? 'lax').toLowerCase();
if (!['lax', 'strict', 'none'].includes(cookieSameSite)) {
  throw new Error(`COOKIE_SAMESITE must be lax, strict or none (got "${cookieSameSite}")`);
}

export const config = {
  env,
  isProduction,
  isTest: env === 'test',
  port: Number(process.env.PORT ?? 3000),

  databaseUrl,
  databaseSsl: resolveDatabaseSsl(databaseUrl),

  // Where the browser app lives. Credentials are cookies, so the allow list has
  // to be explicit — a wildcard origin cannot be combined with credentials.
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  session: {
    cookieName: 'nr_session',
    // 30 days, refreshed whenever a request comes in during the second half
    ttlMs: 30 * 24 * 60 * 60 * 1000,
    renewAfterMs: 15 * 24 * 60 * 60 * 1000,

    // Set this when the API and the web app live on different subdomains of
    // one site — for example COOKIE_DOMAIN=.neuroroute.com with the app on
    // neuroroute.com and the API on api.neuroroute.com. Then the browser
    // treats them as same-site and SameSite=Lax keeps working.
    cookieDomain: process.env.COOKIE_DOMAIN || undefined,
    cookieSameSite,
  },

  // A company has to be verified by an admin before it can trade. This is the
  // point of the admin verification step, so it defaults on, but it can be
  // turned off for local development.
  requireVerifiedCompany: process.env.REQUIRE_VERIFIED_COMPANY !== 'false',

  login: {
    maxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS ?? 10),
    windowMs: Number(process.env.LOGIN_WINDOW_MS ?? 15 * 60 * 1000),
  },
};

/**
 * Configuration mistakes that only show up in production are the expensive
 * kind: a login that silently never sticks, or a cookie a browser refuses.
 * Catch them at startup instead.
 *
 * Returns a list of problems; the caller decides whether to warn or refuse.
 */
export function validateProductionConfig(cfg = config) {
  const problems = [];
  const warnings = [];

  if (cfg.session.cookieSameSite === 'none' && !cfg.isProduction) {
    problems.push('COOKIE_SAMESITE=none requires HTTPS, which means NODE_ENV=production');
  }

  if (!cfg.isProduction) return { problems, warnings };

  if (cfg.corsOrigins.length === 0) {
    problems.push('CORS_ORIGINS is empty — the browser app will not be able to call the API');
  }
  for (const origin of cfg.corsOrigins) {
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      warnings.push(`CORS_ORIGINS still contains a local address: ${origin}`);
    }
    if (origin.startsWith('http://')) {
      problems.push(`CORS_ORIGINS contains a plain-http origin: ${origin}. Cookies are Secure in production and will not be sent.`);
    }
  }

  // The trap this catches: app on neuroroute.com, API on x.up.railway.app.
  // Those are different sites, so a SameSite=Lax cookie is never sent with the
  // app's requests and every login appears to succeed and then does nothing.
  const apiDomain = process.env.PUBLIC_API_ORIGIN;
  if (apiDomain && cfg.session.cookieSameSite === 'lax') {
    const site = (host) => host.split('.').slice(-2).join('.');
    try {
      const apiSite = site(new URL(apiDomain).hostname);
      for (const origin of cfg.corsOrigins) {
        if (site(new URL(origin).hostname) !== apiSite) {
          problems.push(
            `${origin} and ${apiDomain} are different sites, so the SameSite=Lax session cookie ` +
              'will not be sent. Put the API on a subdomain of the app (api.example.com) and set ' +
              'COOKIE_DOMAIN, or set COOKIE_SAMESITE=none.'
          );
        }
      }
    } catch {
      problems.push(`PUBLIC_API_ORIGIN is not a valid URL: ${apiDomain}`);
    }
  }

  if (cfg.databaseSsl === false && !cfg.databaseUrl.includes('.railway.internal')) {
    warnings.push(
      'The database connection is not using TLS and does not look like a private network address'
    );
  }

  if (!cfg.requireVerifiedCompany) {
    warnings.push('REQUIRE_VERIFIED_COMPANY=false — unverified companies can trade');
  }

  return { problems, warnings };
}
