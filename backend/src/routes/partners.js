import { Router } from 'express';

import { query } from '../db.js';
import { ApiError, asyncRoute } from '../lib/errors.js';
import { body, shortText, uuid, z } from '../lib/validate.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

export const partnersRouter = Router();

// A shipper's preferred carriers. This list is what makes "use your own
// network first" concrete: requests are shown to these carriers ahead of
// everyone else, and the shipper's own view ranks their offers first.
partnersRouter.use(requireAuth, requireRole('shipper', 'admin'));

partnersRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const { rows } = await query(
      `SELECT c.id, c.name, c.type, c.country, c.city, c.status, p.note, p.created_at
         FROM partners p
         JOIN companies c ON c.id = p.carrier_company_id
        WHERE p.shipper_company_id = $1
        ORDER BY c.name`,
      [req.user.companyId]
    );
    res.json({ partners: rows });
  })
);

partnersRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const input = body(
      z.object({ carrierCompanyId: uuid, note: shortText(500).optional() }),
      req
    );

    if (input.carrierCompanyId === req.user.companyId) {
      throw ApiError.badRequest('A company cannot be its own partner');
    }

    const { rows: carrierRows } = await query(
      `SELECT id, name, type, status FROM companies WHERE id = $1`,
      [input.carrierCompanyId]
    );
    const carrier = carrierRows[0];
    if (!carrier) throw ApiError.notFound('Company not found');
    if (carrier.type === 'shipper') {
      throw ApiError.badRequest('That company does not offer transport');
    }

    const { rows } = await query(
      `INSERT INTO partners (shipper_company_id, carrier_company_id, note)
       VALUES ($1, $2, $3)
       ON CONFLICT (shipper_company_id, carrier_company_id) DO UPDATE SET note = EXCLUDED.note
       RETURNING created_at, note`,
      [req.user.companyId, input.carrierCompanyId, input.note ?? null]
    );

    res.status(201).json({ partner: { ...carrier, ...rows[0] } });
  })
);

partnersRouter.delete(
  '/:carrierCompanyId',
  asyncRoute(async (req, res) => {
    const { rowCount } = await query(
      'DELETE FROM partners WHERE shipper_company_id = $1 AND carrier_company_id = $2',
      [req.user.companyId, req.params.carrierCompanyId]
    );
    if (rowCount === 0) throw ApiError.notFound('That company is not one of your partners');
    res.status(204).end();
  })
);
