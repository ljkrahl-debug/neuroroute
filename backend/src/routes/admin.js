import { Router } from 'express';

import { query } from '../db.js';
import { ApiError, asyncRoute } from '../lib/errors.js';
import { body, z } from '../lib/validate.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

/** Companies waiting to be let onto the platform, oldest first. */
adminRouter.get(
  '/companies',
  asyncRoute(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : null;

    const { rows } = await query(
      `SELECT c.id, c.name, c.type, c.status, c.country, c.city, c.vat_id AS "vatId",
              c.created_at AS "createdAt",
              (SELECT count(*) FROM users u WHERE u.company_id = c.id) AS "userCount"
         FROM companies c
        WHERE ($1::text IS NULL OR c.status = $1)
        ORDER BY CASE WHEN c.status = 'pending' THEN 0 ELSE 1 END, c.created_at`,
      [status]
    );
    res.json({ companies: rows });
  })
);

/** Verify or reject a company. Nothing can be traded until this happens. */
adminRouter.post(
  '/companies/:id/verification',
  asyncRoute(async (req, res) => {
    const input = body(
      z.object({
        status: z.enum(['verified', 'rejected', 'pending']),
        reason: z.string().trim().max(500).optional(),
      }),
      req
    );

    const { rows } = await query(
      `UPDATE companies SET status = $2 WHERE id = $1
       RETURNING id, name, type, status`,
      [req.params.id, input.status]
    );
    if (rows.length === 0) throw ApiError.notFound('Company not found');

    // A rejected company must not keep working with live sessions.
    if (input.status === 'rejected') {
      await query(
        `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)`,
        [req.params.id]
      );
    }

    res.json({ company: rows[0] });
  })
);

adminRouter.get(
  '/users',
  asyncRoute(async (req, res) => {
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.created_at AS "createdAt",
              c.id AS "companyId", c.name AS "companyName", c.status AS "companyStatus"
         FROM users u
         LEFT JOIN companies c ON c.id = u.company_id
        ORDER BY u.created_at DESC
        LIMIT 500`
    );
    res.json({ users: rows });
  })
);

/** The numbers behind the admin dashboard in the prototype. */
adminRouter.get(
  '/stats',
  asyncRoute(async (req, res) => {
    const { rows } = await query(`
      SELECT
        (SELECT count(*) FROM companies)                              AS "companies",
        (SELECT count(*) FROM companies WHERE status = 'pending')     AS "companiesPending",
        (SELECT count(*) FROM companies WHERE status = 'verified')    AS "companiesVerified",
        (SELECT count(*) FROM users WHERE status = 'active')          AS "activeUsers",
        (SELECT count(*) FROM transport_requests)                     AS "requests",
        (SELECT count(*) FROM transport_requests WHERE status = 'open')     AS "requestsOpen",
        (SELECT count(*) FROM transport_requests WHERE status = 'assigned') AS "requestsAssigned",
        (SELECT count(*) FROM offers WHERE status = 'pending')        AS "offersPending",
        -- sum() over bigint returns numeric, which the driver hands back as a
        -- string; cast it so the API stays consistently numeric
        (SELECT coalesce(sum(accepted_price_cents), 0)::bigint
           FROM transport_requests
          WHERE accepted_price_cents IS NOT NULL)                     AS "brokeredVolumeCents"
    `);

    // count(*) comes back as bigint; the INT8 parser in db.js already turned
    // these into numbers.
    res.json({ stats: rows[0] });
  })
);
