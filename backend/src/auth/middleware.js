import { config } from '../config.js';
import { ApiError } from '../lib/errors.js';
import { renewIfNeeded, resolveSession, sessionCookieOptions } from './sessions.js';

/**
 * Attaches req.user when a valid session cookie is present. Never rejects —
 * routes decide what they need via requireAuth / requireRole.
 */
export async function attachUser(req, res, next) {
  try {
    const token = req.cookies?.[config.session.cookieName];
    const session = await resolveSession(token);
    if (session) {
      req.user = session.user;
      req.sessionToken = token;
      const renewed = await renewIfNeeded(session);
      if (renewed) {
        res.cookie(config.session.cookieName, token, sessionCookieOptions(renewed));
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  next();
}

/** requireRole('shipper') or requireRole('carrier', 'admin') */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(`This endpoint is for ${roles.join(' or ')} accounts`)
      );
    }
    next();
  };
}

/**
 * Trading — creating requests, making offers, accepting — is only open to
 * companies an admin has verified. That is the whole point of the verification
 * step, so it is enforced in one place rather than per route.
 */
export function requireVerifiedCompany(req, res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role === 'admin') return next();

  if (!req.user.company) {
    return next(ApiError.forbidden('Your account is not linked to a company'));
  }
  if (config.requireVerifiedCompany && req.user.company.status !== 'verified') {
    return next(
      new ApiError(
        403,
        'company_not_verified',
        'Your company is awaiting verification by Neuroroute. You cannot trade yet.'
      )
    );
  }
  next();
}

/**
 * Fixed-window limiter for the login route, kept in memory.
 *
 * Good enough for a single instance, which is what the MVP runs on. Behind
 * more than one instance this has to move to Redis or Postgres, otherwise the
 * limit is effectively multiplied by the instance count.
 */
export function createLoginRateLimiter({ maxAttempts, windowMs } = config.login) {
  const attempts = new Map();

  function prune(now) {
    for (const [key, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(key);
    }
  }

  return function loginRateLimit(req, res, next) {
    const now = Date.now();
    if (attempts.size > 5000) prune(now);

    // Keyed by IP and submitted email together, so one noisy office NAT cannot
    // lock out everyone behind it, while one account cannot be brute forced
    // from a single address either.
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    const key = `${req.ip}|${email}`;

    const entry = attempts.get(key);
    if (!entry || entry.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > maxAttempts) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return next(
        ApiError.tooManyRequests(`Too many login attempts. Try again in ${retryAfter} seconds.`)
      );
    }
    next();
  };
}
