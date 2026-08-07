import { Router } from 'express';

import { query } from '../db.js';
import { ApiError, asyncRoute } from '../lib/errors.js';
import { body, isoDate, shortText, transportMode, z } from '../lib/validate.js';
import { requireAuth, requireRole, requireVerifiedCompany } from '../auth/middleware.js';

export const capacityRouter = Router();

capacityRouter.use(requireAuth, requireRole('carrier', 'admin'), requireVerifiedCompany);

const CAPACITY_COLUMNS = `
  c.id                 AS "id",
  c.carrier_company_id AS "carrierCompanyId",
  c.origin             AS "origin",
  c.destination        AS "destination",
  c.mode               AS "mode",
  c.depart_date        AS "departDate",
  c.capacity_desc      AS "capacityDesc",
  c.utilization_pct    AS "utilizationPct",
  c.recurring          AS "recurring",
  c.return_empty       AS "returnEmpty",
  c.created_at         AS "createdAt"
`;

const capacitySchema = z.object({
  origin: shortText(200),
  destination: shortText(200),
  mode: transportMode,
  departDate: isoDate,
  capacityDesc: shortText(300).optional(),
  utilizationPct: z.number().int().min(0).max(100).optional(),
  recurring: z.boolean().optional(),
  returnEmpty: z.boolean().optional(),
});

/** Planned transports, the input the empty-run detection works from. */
capacityRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const input = body(capacitySchema, req);

    const { rows } = await query(
      `INSERT INTO capacity
         (carrier_company_id, created_by, origin, destination, mode, depart_date,
          capacity_desc, utilization_pct, recurring, return_empty)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, carrier_company_id AS "carrierCompanyId", origin, destination, mode,
                 depart_date AS "departDate", capacity_desc AS "capacityDesc",
                 utilization_pct AS "utilizationPct", recurring,
                 return_empty AS "returnEmpty", created_at AS "createdAt"`,
      [
        req.user.companyId,
        req.user.id,
        input.origin,
        input.destination,
        input.mode,
        input.departDate,
        input.capacityDesc ?? null,
        input.utilizationPct ?? null,
        input.recurring ?? false,
        input.returnEmpty ?? false,
      ]
    );

    res.status(201).json({ capacity: rows[0] });
  })
);

capacityRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : null;

    const { rows } = await query(
      `SELECT ${CAPACITY_COLUMNS},
              l.id     AS "listingId",
              l.status AS "listingStatus"
         FROM capacity c
         LEFT JOIN marketplace_listings l
           ON l.capacity_id = c.id AND l.status = 'active'
        WHERE c.carrier_company_id = $1
          AND ($2::date IS NULL OR c.depart_date >= $2)
        ORDER BY c.depart_date, c.created_at`,
      [req.user.companyId, from]
    );
    res.json({ capacity: rows });
  })
);

/**
 * Empty-run detection.
 *
 * Two things count as a wasted leg, and they are found differently:
 *
 *  1. flagged_empty — the carrier ticked "return empty" when planning. Nothing
 *     to infer; it just is not on the marketplace yet.
 *
 *  2. uncovered_return — a loaded leg A→B with no leg leaving B in the days
 *     that follow. The truck has to come back somehow, so that return is
 *     almost certainly running empty even though nobody said so. This is the
 *     case in CLAUDE.md: Hamburg→München loaded, München→Hamburg empty.
 *
 * Both come back with a ready-made payload, so publishing is genuinely one
 * click on the client side.
 */
capacityRouter.get(
  '/suggestions',
  asyncRoute(async (req, res) => {
    // How many days after arrival a follow-on leg still counts as "covered".
    const windowDays = Math.min(Number(req.query.windowDays ?? 3) || 3, 14);

    const { rows: flagged } = await query(
      `SELECT ${CAPACITY_COLUMNS}
         FROM capacity c
         LEFT JOIN marketplace_listings l
           ON l.capacity_id = c.id AND l.status = 'active'
        WHERE c.carrier_company_id = $1
          AND c.return_empty
          AND c.depart_date >= current_date
          AND l.id IS NULL
        ORDER BY c.depart_date`,
      [req.user.companyId]
    );

    const { rows: uncovered } = await query(
      `SELECT ${CAPACITY_COLUMNS}
         FROM capacity c
        WHERE c.carrier_company_id = $1
          AND c.depart_date >= current_date
          AND NOT c.return_empty
          AND NOT EXISTS (
            SELECT 1 FROM capacity back
             WHERE back.carrier_company_id = c.carrier_company_id
               AND back.origin = c.destination
               AND back.depart_date BETWEEN c.depart_date AND c.depart_date + ($2 || ' days')::interval
               AND back.id <> c.id
          )
        ORDER BY c.depart_date`,
      [req.user.companyId, windowDays]
    );

    function nextDay(date, days) {
      const d = new Date(date);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    }

    const suggestions = [
      ...flagged.map((c) => ({
        type: 'flagged_empty',
        reason: `Return leg ${c.origin} → ${c.destination} on ${c.departDate} is marked empty and is not on the marketplace.`,
        capacityId: c.id,
        // publish this leg as it stands
        publish: {
          origin: c.origin,
          destination: c.destination,
          mode: c.mode,
          availableFrom: c.departDate,
        },
      })),
      ...uncovered.map((c) => ({
        type: 'uncovered_return',
        reason: `${c.origin} → ${c.destination} on ${c.departDate} has no return leg planned within ${windowDays} days — the way back is probably running empty.`,
        capacityId: c.id,
        // the return leg does not exist yet, so this creates it first
        createCapacity: {
          origin: c.destination,
          destination: c.origin,
          mode: c.mode,
          departDate: nextDay(c.departDate, 1),
          returnEmpty: true,
          utilizationPct: 0,
        },
      })),
    ];

    res.json({ suggestions, windowDays });
  })
);

capacityRouter.patch(
  '/:id',
  asyncRoute(async (req, res) => {
    const input = body(capacitySchema.partial(), req);
    const fields = Object.keys(input);
    if (fields.length === 0) throw ApiError.badRequest('No fields to update');

    const columns = {
      origin: 'origin',
      destination: 'destination',
      mode: 'mode',
      departDate: 'depart_date',
      capacityDesc: 'capacity_desc',
      utilizationPct: 'utilization_pct',
      recurring: 'recurring',
      returnEmpty: 'return_empty',
    };
    const assignments = fields.map((f, i) => `${columns[f]} = $${i + 3}`);

    const { rows } = await query(
      `UPDATE capacity SET ${assignments.join(', ')}
        WHERE id = $1 AND carrier_company_id = $2
        RETURNING id, origin, destination, mode, depart_date AS "departDate",
                  capacity_desc AS "capacityDesc", utilization_pct AS "utilizationPct",
                  recurring, return_empty AS "returnEmpty"`,
      [req.params.id, req.user.companyId, ...fields.map((f) => input[f])]
    );
    if (rows.length === 0) throw ApiError.notFound('Capacity entry not found');

    res.json({ capacity: rows[0] });
  })
);

capacityRouter.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const { rowCount } = await query(
      'DELETE FROM capacity WHERE id = $1 AND carrier_company_id = $2',
      [req.params.id, req.user.companyId]
    );
    if (rowCount === 0) throw ApiError.notFound('Capacity entry not found');
    res.status(204).end();
  })
);
