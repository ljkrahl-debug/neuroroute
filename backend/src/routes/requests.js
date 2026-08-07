import { Router } from 'express';

import { query } from '../db.js';
import { ApiError, asyncRoute } from '../lib/errors.js';
import { body, isoDate, shortText, transportMode, z } from '../lib/validate.js';
import { requireAuth, requireRole, requireVerifiedCompany } from '../auth/middleware.js';

export const requestsRouter = Router();

requestsRouter.use(requireAuth);

// The API speaks camelCase, the database snake_case; the aliases are the one
// place that translation happens.
// [column, alias, cast]. The cast on weight_kg matters: numeric columns come
// back from the driver as strings to protect precision, which would put
// "12400.00" in the JSON. Weights do not need arbitrary precision, so they are
// cast to float8 and arrive as numbers like every other number in the API.
const REQUEST_FIELDS = [
  ['id', 'id'],
  ['reference', 'reference'],
  ['origin', 'origin'],
  ['destination', 'destination'],
  ['mode', 'mode'],
  ['cargo', 'cargo'],
  ['weight_kg', 'weightKg', 'float8'],
  ['pickup_date', 'pickupDate'],
  ['delivery_date', 'deliveryDate'],
  ['notes', 'notes'],
  ['status', 'status'],
  ['shipper_company_id', 'shipperCompanyId'],
  ['carrier_company_id', 'carrierCompanyId'],
  ['accepted_offer_id', 'acceptedOfferId'],
  ['accepted_price_cents', 'acceptedPriceCents'],
  ['partner_exclusive_until', 'partnerExclusiveUntil'],
  ['created_at', 'createdAt'],
];

/**
 * "Use your own network first", as a SQL condition.
 *
 * While partner_exclusive_until is in the future, only the shipper's preferred
 * partners may see the request. After it passes — or when it was never set,
 * which is the case for shippers with no partners — it is on the open market.
 *
 * @param placeholder the bind parameter holding the carrier's company id
 */
export function carrierVisibilitySql(placeholder, alias = 'r') {
  return `(
    ${alias}.partner_exclusive_until IS NULL
    OR ${alias}.partner_exclusive_until <= now()
    OR EXISTS (
      SELECT 1 FROM partners p
       WHERE p.shipper_company_id = ${alias}.shipper_company_id
         AND p.carrier_company_id = ${placeholder}
    )
  )`;
}

// A shipper can hold a request back for at most a week; longer is not a
// preference any more, it is just a stalled transport.
const MAX_EXCLUSIVE_HOURS = 168;
const DEFAULT_EXCLUSIVE_HOURS = 24;

function requestColumns(prefix = '') {
  return REQUEST_FIELDS.map(
    ([column, alias, cast]) => `${prefix}${column}${cast ? `::${cast}` : ''} AS "${alias}"`
  ).join(', ');
}

const REQUEST_COLUMNS = requestColumns('r.');

const createSchema = z
  .object({
    origin: shortText(200),
    destination: shortText(200),
    mode: transportMode,
    cargo: shortText(500),
    weightKg: z.number().positive().max(10_000_000).optional(),
    pickupDate: isoDate,
    deliveryDate: isoDate.optional(),
    notes: z.string().trim().max(2000).optional(),
    // 0 sends the request straight to the open market.
    partnerExclusiveHours: z.number().int().min(0).max(MAX_EXCLUSIVE_HOURS).optional(),
  })
  .refine((v) => !v.deliveryDate || v.deliveryDate >= v.pickupDate, {
    message: 'Delivery date cannot be before the pickup date',
    path: ['deliveryDate'],
  });

/** Shipper posts a transport request. Step 1 of the core flow. */
requestsRouter.post(
  '/',
  requireRole('shipper'),
  requireVerifiedCompany,
  asyncRoute(async (req, res) => {
    const input = body(createSchema, req);

    // Holding a request back only means something if there are partners to hold
    // it back for. With an empty partner list the window would just delay the
    // transport for nobody's benefit, so it is skipped.
    const { rows: partnerRows } = await query(
      'SELECT count(*)::int AS count FROM partners WHERE shipper_company_id = $1',
      [req.user.companyId]
    );
    const partnerCount = partnerRows[0].count;
    const hours = input.partnerExclusiveHours ?? DEFAULT_EXCLUSIVE_HOURS;
    const exclusiveHours = partnerCount > 0 ? hours : 0;

    const { rows } = await query(
      `INSERT INTO transport_requests
         (shipper_company_id, created_by, origin, destination, mode, cargo,
          weight_kg, pickup_date, delivery_date, notes, partner_exclusive_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               CASE WHEN $11::int > 0 THEN now() + ($11 || ' hours')::interval ELSE NULL END)
       RETURNING ${requestColumns()}`,
      [
        req.user.companyId,
        req.user.id,
        input.origin,
        input.destination,
        input.mode,
        input.cargo,
        input.weightKg ?? null,
        input.pickupDate,
        input.deliveryDate ?? null,
        input.notes ?? null,
        exclusiveHours,
      ]
    );

    res.status(201).json({
      request: rows[0],
      matching: {
        partnerCount,
        // Say plainly who can see it, so the UI does not have to infer it.
        visibility: rows[0].partnerExclusiveUntil ? 'partners_only' : 'open_market',
      },
    });
  })
);

/**
 * The request feed. What it contains depends on who is asking:
 *
 *  - shipper: their own company's requests, with a live offer count
 *  - carrier: open requests, preferred partners first (the "use your own
 *    network first" idea), plus whatever offer this carrier already has on
 *    each one. ?view=assigned returns the work they won.
 *  - admin:   everything
 */
requestsRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const view = typeof req.query.view === 'string' ? req.query.view : null;

    if (req.user.role === 'shipper') {
      const { rows } = await query(
        `SELECT ${REQUEST_COLUMNS},
                carrier.name AS "carrierName",
                (SELECT count(*) FROM offers o
                  WHERE o.request_id = r.id AND o.status = 'pending') AS "openOfferCount"
           FROM transport_requests r
           LEFT JOIN companies carrier ON carrier.id = r.carrier_company_id
          WHERE r.shipper_company_id = $1
            AND ($2::text IS NULL OR r.status = $2)
          ORDER BY r.created_at DESC`,
        [req.user.companyId, status]
      );
      return res.json({ requests: rows });
    }

    if (req.user.role === 'carrier' || req.user.role === 'driver') {
      if (view === 'assigned') {
        const { rows } = await query(
          `SELECT ${REQUEST_COLUMNS}, shipper.name AS "shipperName"
             FROM transport_requests r
             JOIN companies shipper ON shipper.id = r.shipper_company_id
            WHERE r.carrier_company_id = $1
              AND ($2::text IS NULL OR r.status = $2)
            ORDER BY r.pickup_date`,
          [req.user.companyId, status]
        );
        return res.json({ requests: rows });
      }

      // Open market view. is_preferred_partner drives the ordering, so a
      // carrier sees work from shippers that already chose them at the top.
      const { rows } = await query(
        `SELECT ${REQUEST_COLUMNS},
                shipper.name AS "shipperName",
                EXISTS (
                  SELECT 1 FROM partners p
                   WHERE p.shipper_company_id = r.shipper_company_id
                     AND p.carrier_company_id = $1
                ) AS "isPreferredPartner",
                mine.id          AS "myOfferId",
                mine.price_cents AS "myOfferPriceCents",
                mine.status      AS "myOfferStatus"
           FROM transport_requests r
           JOIN companies shipper ON shipper.id = r.shipper_company_id
           LEFT JOIN offers mine
             ON mine.request_id = r.id
            AND mine.carrier_company_id = $1
            AND mine.status IN ('pending', 'accepted')
          WHERE r.status = 'open'
            AND r.shipper_company_id <> $1
            AND ${carrierVisibilitySql('$1')}
          ORDER BY "isPreferredPartner" DESC, r.pickup_date, r.created_at DESC
          LIMIT 200`,
        [req.user.companyId]
      );
      return res.json({ requests: rows });
    }

    const { rows } = await query(
      `SELECT ${REQUEST_COLUMNS},
              shipper.name AS "shipperName",
              carrier.name AS "carrierName"
         FROM transport_requests r
         JOIN companies shipper ON shipper.id = r.shipper_company_id
         LEFT JOIN companies carrier ON carrier.id = r.carrier_company_id
        WHERE ($1::text IS NULL OR r.status = $1)
        ORDER BY r.created_at DESC
        LIMIT 500`,
      [status]
    );
    res.json({ requests: rows });
  })
);

/**
 * Loads a request and decides whether this user may see it.
 * Shared by this router and the offers router.
 */
export async function loadVisibleRequest(requestId, user) {
  const { rows } = await query(
    `SELECT ${REQUEST_COLUMNS},
            shipper.name AS "shipperName",
            carrier.name AS "carrierName"
       FROM transport_requests r
       JOIN companies shipper ON shipper.id = r.shipper_company_id
       LEFT JOIN companies carrier ON carrier.id = r.carrier_company_id
      WHERE r.id = $1`,
    [requestId]
  );
  const request = rows[0];
  if (!request) throw ApiError.notFound('Request not found');

  if (user.role === 'admin') return request;

  const isOwner = request.shipperCompanyId === user.companyId;
  const isAssignedCarrier = request.carrierCompanyId === user.companyId;

  // An open request is on the market, so any carrier may look at it — unless it
  // is still inside its partner-exclusive window, in which case only the
  // shipper's preferred partners can. Checking this here and not only in the
  // list query matters: otherwise a carrier could read, and bid on, a request
  // it is not meant to see yet simply by knowing its id.
  let isOpenToCarriers = false;
  if (request.status === 'open' && (user.role === 'carrier' || user.role === 'driver')) {
    const { rows: visibleRows } = await query(
      `SELECT ${carrierVisibilitySql('$2')} AS visible
         FROM transport_requests r WHERE r.id = $1`,
      [requestId, user.companyId]
    );
    isOpenToCarriers = visibleRows[0].visible;
  }

  if (!isOwner && !isAssignedCarrier && !isOpenToCarriers) {
    throw ApiError.forbidden('You do not have access to this request');
  }
  return request;
}

requestsRouter.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const request = await loadVisibleRequest(req.params.id, req.user);
    res.json({ request });
  })
);

/**
 * Ends the partner-exclusive window early. A shipper whose partners have not
 * responded should not have to wait out the clock to reach the open market.
 */
requestsRouter.post(
  '/:id/open-to-market',
  requireRole('shipper'),
  asyncRoute(async (req, res) => {
    const { rows } = await query(
      'SELECT id, status, shipper_company_id, partner_exclusive_until FROM transport_requests WHERE id = $1',
      [req.params.id]
    );
    const request = rows[0];
    if (!request) throw ApiError.notFound('Request not found');
    if (request.shipper_company_id !== req.user.companyId) {
      throw ApiError.forbidden('You can only change your own requests');
    }
    if (request.status !== 'open') {
      throw ApiError.conflict(`This request is ${request.status}`);
    }
    if (!request.partner_exclusive_until) {
      throw ApiError.conflict('This request is already on the open market');
    }

    const { rows: updated } = await query(
      `UPDATE transport_requests SET partner_exclusive_until = NULL WHERE id = $1
       RETURNING ${requestColumns()}`,
      [req.params.id]
    );
    res.json({ request: updated[0] });
  })
);

requestsRouter.post(
  '/:id/cancel',
  requireRole('shipper'),
  asyncRoute(async (req, res) => {
    const { rows } = await query(
      'SELECT id, status, shipper_company_id FROM transport_requests WHERE id = $1',
      [req.params.id]
    );
    const request = rows[0];
    if (!request) throw ApiError.notFound('Request not found');
    if (request.shipper_company_id !== req.user.companyId) {
      throw ApiError.forbidden('You can only cancel your own requests');
    }
    if (request.status !== 'open') {
      throw ApiError.conflict(
        `A request can only be cancelled while it is open (this one is ${request.status})`
      );
    }

    await query(
      `UPDATE transport_requests SET status = 'cancelled' WHERE id = $1`,
      [req.params.id]
    );
    // Pending offers on a cancelled request are dead; close them so carriers
    // do not keep seeing them as live bids.
    await query(
      `UPDATE offers SET status = 'rejected' WHERE request_id = $1 AND status = 'pending'`,
      [req.params.id]
    );

    res.status(204).end();
  })
);
