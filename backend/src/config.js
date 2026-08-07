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

export const config = {
  env,
  isProduction,
  isTest: env === 'test',
  port: Number(process.env.PORT ?? 3000),

  databaseUrl: required('DATABASE_URL'),

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

if (isProduction && config.corsOrigins.some((o) => o.includes('localhost'))) {
  console.warn('[config] CORS_ORIGINS still contains localhost in production');
}
