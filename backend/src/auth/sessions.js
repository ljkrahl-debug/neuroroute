import { createHash, randomBytes } from 'node:crypto';

import { config } from '../config.js';
import { query } from '../db.js';

// Opaque server-side sessions rather than JWTs. Two reasons that matter here:
// logout and "disable this user" have to take effect immediately (a signed JWT
// stays valid until it expires, no matter what the database says), and CLAUDE.md
// requires personal data to stay in the EU — sessions in our own Postgres keep
// it there, with no third-party processor and no extra DPA. CLAUDE.md suggests
// Auth0/Clerk/Lucia; Lucia has since been deprecated in favour of exactly this
// pattern, and the hosted options are worth revisiting when SSO is needed.

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken() {
  // 32 bytes, base64url — 256 bits of entropy, safe in a cookie
  return randomBytes(32).toString('base64url');
}

export async function createSession(userId, { userAgent, ip } = {}) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + config.session.ttlMs);

  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [hashToken(token), userId, expiresAt, userAgent?.slice(0, 500) ?? null, ip ?? null]
  );

  return { token, expiresAt };
}

/**
 * Look up the session and its user. Returns null for unknown, expired or
 * disabled accounts. Expired rows are deleted as they are encountered so the
 * table does not need a separate sweep to stay correct.
 */
export async function resolveSession(token) {
  if (!token) return null;

  const { rows } = await query(
    `SELECT s.token_hash, s.expires_at,
            u.id, u.email, u.name, u.role, u.status, u.company_id,
            c.name AS company_name, c.type AS company_type, c.status AS company_status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN companies c ON c.id = u.company_id
      WHERE s.token_hash = $1`,
    [hashToken(token)]
  );

  const row = rows[0];
  if (!row) return null;

  if (new Date(row.expires_at) <= new Date()) {
    await query('DELETE FROM sessions WHERE token_hash = $1', [row.token_hash]);
    return null;
  }

  if (row.status !== 'active') return null;

  return {
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      companyId: row.company_id,
      company: row.company_id
        ? { id: row.company_id, name: row.company_name, type: row.company_type, status: row.company_status }
        : null,
    },
  };
}

/** Slide the expiry forward once a session is past the halfway mark. */
export async function renewIfNeeded(session) {
  const remaining = new Date(session.expiresAt).getTime() - Date.now();
  if (remaining > config.session.renewAfterMs) return null;

  const expiresAt = new Date(Date.now() + config.session.ttlMs);
  await query('UPDATE sessions SET expires_at = $1 WHERE token_hash = $2', [
    expiresAt,
    session.tokenHash,
  ]);
  return expiresAt;
}

export async function destroySession(token) {
  if (!token) return;
  await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

export async function destroyAllSessionsForUser(userId) {
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export async function deleteExpiredSessions() {
  const { rowCount } = await query('DELETE FROM sessions WHERE expires_at <= now()');
  return rowCount;
}

/**
 * Cookie attributes. Everything except `expires` has to be identical between
 * setting and clearing a cookie — a clearCookie that omits the domain leaves
 * the original one in place and the user stays logged in after logging out.
 */
function baseCookieOptions() {
  return {
    httpOnly: true,
    // Lax still sends the cookie on top-level navigation from the marketing
    // site, and blocks it on cross-site POSTs, which is the CSRF case here.
    // COOKIE_SAMESITE=none is for the case where the API genuinely cannot live
    // on a subdomain of the app; it needs Secure, which production sets.
    sameSite: config.session.cookieSameSite,
    secure: config.isProduction,
    path: '/',
    ...(config.session.cookieDomain ? { domain: config.session.cookieDomain } : {}),
  };
}

export function sessionCookieOptions(expiresAt) {
  return { ...baseCookieOptions(), expires: expiresAt };
}

export function clearSessionCookieOptions() {
  return baseCookieOptions();
}
