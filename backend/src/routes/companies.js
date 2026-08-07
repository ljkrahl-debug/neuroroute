import { Router } from 'express';

import { query } from '../db.js';
import { ApiError, asyncRoute } from '../lib/errors.js';
import { body, shortText, z } from '../lib/validate.js';
import { requireAuth } from '../auth/middleware.js';

export const companiesRouter = Router();

companiesRouter.use(requireAuth);

const updateSchema = z.object({
  name: shortText(200).optional(),
  country: shortText(80).nullable().optional(),
  city: shortText(120).nullable().optional(),
  vatId: shortText(40).nullable().optional(),
});

/** The public company profile, as shown on profile.html. */
companiesRouter.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const { rows } = await query(
      `SELECT c.id, c.name, c.type, c.status, c.country, c.city, c.created_at,
              (SELECT count(*) FROM transport_requests r
                WHERE r.carrier_company_id = c.id AND r.status = 'delivered') AS completed_transports
         FROM companies c
        WHERE c.id = $1`,
      [req.params.id]
    );
    const company = rows[0];
    if (!company) throw ApiError.notFound('Company not found');

    // The VAT id is only shown to the company itself and to admins.
    const privileged = req.user.role === 'admin' || req.user.companyId === company.id;
    if (privileged) {
      const { rows: vatRows } = await query('SELECT vat_id FROM companies WHERE id = $1', [company.id]);
      company.vat_id = vatRows[0].vat_id;
    }

    res.json({ company });
  })
);

companiesRouter.patch(
  '/:id',
  asyncRoute(async (req, res) => {
    if (req.user.role !== 'admin' && req.user.companyId !== req.params.id) {
      throw ApiError.forbidden('You can only edit your own company');
    }
    const input = body(updateSchema, req);
    const fields = Object.keys(input);
    if (fields.length === 0) throw ApiError.badRequest('No fields to update');

    const columns = { name: 'name', country: 'country', city: 'city', vatId: 'vat_id' };
    const assignments = fields.map((field, i) => `${columns[field]} = $${i + 2}`);
    const values = fields.map((field) => input[field]);

    const { rows } = await query(
      `UPDATE companies SET ${assignments.join(', ')} WHERE id = $1
       RETURNING id, name, type, status, country, city, vat_id`,
      [req.params.id, ...values]
    );
    if (rows.length === 0) throw ApiError.notFound('Company not found');

    res.json({ company: rows[0] });
  })
);

/**
 * Carrier directory, used when a shipper is looking for partners to add.
 * Only verified companies appear.
 */
companiesRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type : null;

    const { rows } = await query(
      `SELECT id, name, type, country, city
         FROM companies
        WHERE status = 'verified'
          AND ($1::text IS NULL OR type = $1 OR type = 'both')
          AND ($2 = '' OR name ILIKE '%' || $2 || '%')
        ORDER BY name
        LIMIT 100`,
      [type, search]
    );
    res.json({ companies: rows });
  })
);
