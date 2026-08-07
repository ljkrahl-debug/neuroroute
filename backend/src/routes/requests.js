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
  ['created_at', 'createdAt'],
];

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

    const { rows } = await query(
      `INSERT INTO transport_requests
         (shipper_company_id, created_by, origin, destination, mode, cargo,
          weight_kg, pickup_date, delivery_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      ]
    );

    res.status(201).json({ request: rows[0] });
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
  // An open request is on the market, so any carrier may look at it. Once it
  // is assigned, only the two companies involved can.
  const isOpenToCarriers =
    request.status === 'open' && (user.role === 'carrier' || user.role === 'driver');

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
