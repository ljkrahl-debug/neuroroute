import { Router } from 'express';

import { query } from '../db.js';
import { ApiError, asyncRoute } from '../lib/errors.js';
import { body, email, shortText, z } from '../lib/validate.js';
import { MIN_PASSWORD_LENGTH, hashPassword } from '../auth/password.js';
import { requireAuth } from '../auth/middleware.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

// Which roles each role may create inside its own company. A carrier signs up
// its dispatchers and drivers; a shipper its colleagues. Admins are created
// with scripts/create-admin.js, never through the API.
const CAN_CREATE = {
  carrier: ['carrier', 'driver'],
  shipper: ['shipper'],
  admin: ['carrier', 'shipper', 'driver'],
  driver: [],
};

const createUserSchema = z.object({
  name: shortText(200),
  email,
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  role: z.enum(['carrier', 'shipper', 'driver']),
  companyId: z.string().uuid().optional(),
});

usersRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    if (!req.user.companyId && req.user.role !== 'admin') {
      throw ApiError.forbidden('Your account is not linked to a company');
    }
    const companyId = req.user.role === 'admin' ? (req.query.companyId ?? null) : req.user.companyId;
    if (!companyId) {
      throw ApiError.badRequest('companyId query parameter is required for admins');
    }

    const { rows } = await query(
      `SELECT id, name, email, role, status, created_at
         FROM users WHERE company_id = $1 ORDER BY created_at`,
      [companyId]
    );
    res.json({ users: rows });
  })
);

usersRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const input = body(createUserSchema, req);

    const allowed = CAN_CREATE[req.user.role] ?? [];
    if (!allowed.includes(input.role)) {
      throw ApiError.forbidden(
        allowed.length === 0
          ? 'Your account cannot create other users'
          : `Your account can only create ${allowed.join(' or ')} users`
      );
    }

    // Non-admins can only ever add people to their own company; the companyId
    // in the body is ignored for them rather than trusted.
    const companyId = req.user.role === 'admin' ? input.companyId : req.user.companyId;
    if (!companyId) {
      throw ApiError.badRequest('companyId is required');
    }

    const company = await query('SELECT id FROM companies WHERE id = $1', [companyId]);
    if (company.rowCount === 0) throw ApiError.notFound('Company not found');

    const existing = await query('SELECT 1 FROM users WHERE email = $1', [input.email]);
    if (existing.rowCount > 0) {
      throw ApiError.conflict('An account with this email already exists', { field: 'email' });
    }

    const passwordHash = await hashPassword(input.password);
    const { rows } = await query(
      `INSERT INTO users (company_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, status, created_at`,
      [companyId, input.email, passwordHash, input.name, input.role]
    );

    res.status(201).json({ user: rows[0] });
  })
);

usersRouter.post(
  '/:id/disable',
  asyncRoute(async (req, res) => {
    const targetId = req.params.id;
    if (targetId === req.user.id) {
      throw ApiError.badRequest('You cannot disable your own account');
    }

    const { rows } = await query('SELECT id, company_id, role FROM users WHERE id = $1', [targetId]);
    const target = rows[0];
    if (!target) throw ApiError.notFound('User not found');

    const sameCompany = target.company_id && target.company_id === req.user.companyId;
    if (req.user.role !== 'admin' && !(sameCompany && CAN_CREATE[req.user.role]?.includes(target.role))) {
      throw ApiError.forbidden('You cannot disable this user');
    }

    await query(`UPDATE users SET status = 'disabled' WHERE id = $1`, [targetId]);
    // Disabling has to log the person out everywhere, immediately.
    await query('DELETE FROM sessions WHERE user_id = $1', [targetId]);

    res.status(204).end();
  })
);
