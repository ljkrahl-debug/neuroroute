import { Router } from 'express';

import { config } from '../config.js';
import { query, transaction } from '../db.js';
import { ApiError, asyncRoute } from '../lib/errors.js';
import { body, companyType, email, shortText, z } from '../lib/validate.js';
import { MIN_PASSWORD_LENGTH, fakeVerify, hashPassword, verifyPassword } from '../auth/password.js';
import {
  createSession,
  destroyAllSessionsForUser,
  destroySession,
  sessionCookieOptions,
} from '../auth/sessions.js';
import { createLoginRateLimiter, requireAuth } from '../auth/middleware.js';

export const authRouter = Router();

const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(200);

// Only the two trading roles can self-register. Admins are created with
// scripts/create-admin.js, drivers by their own carrier via POST /api/users.
const registerSchema = z.object({
  company: z.object({
    name: shortText(200),
    type: companyType,
    country: shortText(80).optional(),
    city: shortText(120).optional(),
    vatId: shortText(40).optional(),
  }),
  user: z.object({
    name: shortText(200),
    email,
    password,
    role: z.enum(['shipper', 'carrier']),
  }),
});

function roleFitsCompany(role, type) {
  if (type === 'both') return true;
  return role === type;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    company: user.company ?? null,
  };
}

authRouter.post(
  '/register',
  asyncRoute(async (req, res) => {
    const input = body(registerSchema, req);

    if (!roleFitsCompany(input.user.role, input.company.type)) {
      throw ApiError.badRequest(
        `A ${input.company.type} company cannot have a ${input.user.role} account as its owner`,
        { field: 'user.role' }
      );
    }

    const existing = await query('SELECT 1 FROM users WHERE email = $1', [input.user.email]);
    if (existing.rowCount > 0) {
      throw ApiError.conflict('An account with this email already exists', { field: 'user.email' });
    }

    const passwordHash = await hashPassword(input.user.password);

    const created = await transaction(async (client) => {
      const { rows: companyRows } = await client.query(
        `INSERT INTO companies (name, type, country, city, vat_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, type, status`,
        [
          input.company.name,
          input.company.type,
          input.company.country ?? null,
          input.company.city ?? null,
          input.company.vatId ?? null,
        ]
      );
      const company = companyRows[0];

      const { rows: userRows } = await client.query(
        `INSERT INTO users (company_id, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, name, role`,
        [company.id, input.user.email, passwordHash, input.user.name, input.user.role]
      );

      return { company, user: userRows[0] };
    });

    const { token, expiresAt } = await createSession(created.user.id, {
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
    res.cookie(config.session.cookieName, token, sessionCookieOptions(expiresAt));

    res.status(201).json({
      user: publicUser({ ...created.user, company: created.company }),
      // Nothing can be traded until an admin verifies the company, so say so
      // plainly rather than letting the first request fail with a 403.
      notice:
        created.company.status === 'verified'
          ? null
          : 'Your company is awaiting verification. You can sign in, but not yet post requests or offers.',
    });
  })
);

authRouter.post(
  '/login',
  createLoginRateLimiter(),
  asyncRoute(async (req, res) => {
    const input = body(z.object({ email, password: z.string().max(200) }), req);

    const { rows } = await query(
      `SELECT u.id, u.email, u.name, u.role, u.status, u.password_hash, u.company_id,
              c.name AS company_name, c.type AS company_type, c.status AS company_status
         FROM users u
         LEFT JOIN companies c ON c.id = u.company_id
        WHERE u.email = $1`,
      [input.email]
    );
    const row = rows[0];

    // Same message and comparable timing whether the address exists or not, so
    // login cannot be used to enumerate accounts.
    const ok = row ? await verifyPassword(input.password, row.password_hash) : await fakeVerify();
    if (!ok || !row || row.status !== 'active') {
      throw ApiError.unauthorized('Email or password is incorrect');
    }

    const { token, expiresAt } = await createSession(row.id, {
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
    res.cookie(config.session.cookieName, token, sessionCookieOptions(expiresAt));

    res.json({
      user: publicUser({
        ...row,
        company: row.company_id
          ? {
              id: row.company_id,
              name: row.company_name,
              type: row.company_type,
              status: row.company_status,
            }
          : null,
      }),
    });
  })
);

authRouter.post(
  '/logout',
  asyncRoute(async (req, res) => {
    await destroySession(req.sessionToken);
    res.clearCookie(config.session.cookieName, { path: '/' });
    res.status(204).end();
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  })
);

authRouter.post(
  '/password',
  requireAuth,
  asyncRoute(async (req, res) => {
    const input = body(
      z.object({ currentPassword: z.string().max(200), newPassword: password }),
      req
    );

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await verifyPassword(input.currentPassword, rows[0].password_hash))) {
      throw ApiError.unauthorized('Current password is incorrect');
    }

    const passwordHash = await hashPassword(input.newPassword);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.user.id]);

    // A password change should end sessions elsewhere; keep this one alive.
    await destroyAllSessionsForUser(req.user.id);
    const { token, expiresAt } = await createSession(req.user.id, {
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
    res.cookie(config.session.cookieName, token, sessionCookieOptions(expiresAt));

    res.status(204).end();
  })
);
