import { Router } from 'express';

import { query, transaction } from '../db.js';
import { ApiError, asyncRoute } from '../lib/errors.js';
import { body, isoDate, priceToCents, z } from '../lib/validate.js';
import { requireAuth, requireRole, requireVerifiedCompany } from '../auth/middleware.js';
import { loadVisibleRequest } from './requests.js';

const OFFER_COLUMNS = `
  o.id                 AS "id",
  o.request_id         AS "requestId",
  o.carrier_company_id AS "carrierCompanyId",
  o.price_cents        AS "priceCents",
  o.currency           AS "currency",
  o.message            AS "message",
  o.valid_until        AS "validUntil",
  o.status             AS "status",
  o.created_at         AS "createdAt"
`;

const createOfferSchema = z.object({
  price: priceToCents,
  currency: z.string().length(3).toUpperCase().default('EUR'),
  message: z.string().trim().max(1000).optional(),
  validUntil: isoDate.optional(),
});

// ---------------------------------------------------------------------------
// Nested under a request: /api/requests/:requestId/offers
// ---------------------------------------------------------------------------

export const requestOffersRouter = Router({ mergeParams: true });

requestOffersRouter.use(requireAuth);

/** Carrier bids on an open request. Step 3 of the core flow. */
requestOffersRouter.post(
  '/',
  requireRole('carrier'),
  requireVerifiedCompany,
  asyncRoute(async (req, res) => {
    const input = body(createOfferSchema, req);

    const { rows } = await query(
      'SELECT id, status, shipper_company_id FROM transport_requests WHERE id = $1',
      [req.params.requestId]
    );
    const request = rows[0];
    if (!request) throw ApiError.notFound('Request not found');

    // A forwarder can be both shipper and carrier, so this is a real case:
    // bidding on your own company's request is not allowed.
    if (request.shipper_company_id === req.user.companyId) {
      throw ApiError.badRequest('You cannot bid on your own request');
    }
    if (request.status !== 'open') {
      throw ApiError.conflict(
        `This request is no longer open for offers (status: ${request.status})`
      );
    }

    try {
      const { rows: created } = await query(
        `INSERT INTO offers (request_id, carrier_company_id, created_by, price_cents, currency, message, valid_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, request_id AS "requestId", carrier_company_id AS "carrierCompanyId",
                   price_cents AS "priceCents", currency, message,
                   valid_until AS "validUntil", status, created_at AS "createdAt"`,
        [
          request.id,
          req.user.companyId,
          req.user.id,
          input.price,
          input.currency,
          input.message ?? null,
          input.validUntil ?? null,
        ]
      );
      return res.status(201).json({ offer: created[0] });
    } catch (err) {
      // offers_one_live_per_carrier
      if (err.code === '23505') {
        throw ApiError.conflict(
          'You already have a live offer on this request. Withdraw it first to bid again.'
        );
      }
      throw err;
    }
  })
);

/**
 * Offers on a request. The owning shipper sees all of them with carrier names
 * and whether that carrier is one of their preferred partners; a carrier sees
 * only its own. Competitors' prices are never exposed.
 */
requestOffersRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const request = await loadVisibleRequest(req.params.requestId, req.user);
    const isOwner = request.shipperCompanyId === req.user.companyId;

    if (isOwner || req.user.role === 'admin') {
      const { rows } = await query(
        `SELECT ${OFFER_COLUMNS},
                c.name AS "carrierName",
                EXISTS (
                  SELECT 1 FROM partners p
                   WHERE p.shipper_company_id = $2
                     AND p.carrier_company_id = o.carrier_company_id
                ) AS "isPreferredPartner"
           FROM offers o
           JOIN companies c ON c.id = o.carrier_company_id
          WHERE o.request_id = $1
          ORDER BY "isPreferredPartner" DESC, o.price_cents ASC, o.created_at ASC`,
        [request.id, request.shipperCompanyId]
      );
      return res.json({ offers: rows });
    }

    const { rows } = await query(
      `SELECT ${OFFER_COLUMNS} FROM offers o
        WHERE o.request_id = $1 AND o.carrier_company_id = $2
        ORDER BY o.created_at DESC`,
      [request.id, req.user.companyId]
    );
    res.json({ offers: rows });
  })
);

// ---------------------------------------------------------------------------
// Top level: /api/offers
// ---------------------------------------------------------------------------

export const offersRouter = Router();

offersRouter.use(requireAuth);

/** A carrier's own bids across all requests. */
offersRouter.get(
  '/',
  requireRole('carrier', 'admin'),
  asyncRoute(async (req, res) => {
    const companyId = req.user.role === 'admin' ? (req.query.companyId ?? null) : req.user.companyId;

    const { rows } = await query(
      `SELECT ${OFFER_COLUMNS},
              r.reference   AS "requestReference",
              r.origin      AS "requestOrigin",
              r.destination AS "requestDestination",
              r.status      AS "requestStatus",
              s.name        AS "shipperName"
         FROM offers o
         JOIN transport_requests r ON r.id = o.request_id
         JOIN companies s ON s.id = r.shipper_company_id
        WHERE ($1::uuid IS NULL OR o.carrier_company_id = $1)
        ORDER BY o.created_at DESC
        LIMIT 200`,
      [companyId]
    );
    res.json({ offers: rows });
  })
);

/**
 * Shipper accepts an offer. Step 4 of the core flow, and the one place where
 * getting it wrong costs money, so it is one transaction:
 *
 *   - the request row is locked first, which serialises two shippers (or two
 *     browser tabs) racing to accept different offers
 *   - the winning offer becomes accepted, every other pending offer is rejected
 *   - the request becomes assigned and records carrier and price
 *
 * The partial unique index offers_one_accepted_per_request is the backstop: even
 * if the lock were missed, the database will not allow a second accepted offer.
 */
offersRouter.post(
  '/:id/accept',
  requireRole('shipper'),
  requireVerifiedCompany,
  asyncRoute(async (req, res) => {
    const result = await transaction(async (client) => {
      const { rows: offerRows } = await client.query(
        `SELECT o.id, o.request_id, o.carrier_company_id, o.price_cents, o.status
           FROM offers o WHERE o.id = $1`,
        [req.params.id]
      );
      const offer = offerRows[0];
      if (!offer) throw ApiError.notFound('Offer not found');

      const { rows: requestRows } = await client.query(
        `SELECT id, status, shipper_company_id
           FROM transport_requests WHERE id = $1 FOR UPDATE`,
        [offer.request_id]
      );
      const request = requestRows[0];

      if (request.shipper_company_id !== req.user.companyId) {
        throw ApiError.forbidden('You can only accept offers on your own requests');
      }
      if (request.status !== 'open') {
        throw ApiError.conflict(
          `This request is already ${request.status}; only one offer can be accepted`
        );
      }
      // Re-read the offer under the request lock: it may have been withdrawn
      // between the two statements.
      const { rows: freshOffer } = await client.query(
        'SELECT status FROM offers WHERE id = $1 FOR UPDATE',
        [offer.id]
      );
      if (freshOffer[0].status !== 'pending') {
        throw ApiError.conflict(`This offer is ${freshOffer[0].status} and can no longer be accepted`);
      }

      await client.query(`UPDATE offers SET status = 'accepted' WHERE id = $1`, [offer.id]);
      await client.query(
        `UPDATE offers SET status = 'rejected'
          WHERE request_id = $1 AND id <> $2 AND status = 'pending'`,
        [request.id, offer.id]
      );

      const { rows: updated } = await client.query(
        `UPDATE transport_requests
            SET status = 'assigned',
                accepted_offer_id = $2,
                carrier_company_id = $3,
                accepted_price_cents = $4
          WHERE id = $1
          RETURNING id, reference, status,
                    carrier_company_id AS "carrierCompanyId",
                    accepted_offer_id AS "acceptedOfferId",
                    accepted_price_cents AS "acceptedPriceCents"`,
        [request.id, offer.id, offer.carrier_company_id, offer.price_cents]
      );

      return updated[0];
    });

    res.json({ request: result });
  })
);

/** Carrier pulls a bid back while it is still pending. */
offersRouter.post(
  '/:id/withdraw',
  requireRole('carrier'),
  asyncRoute(async (req, res) => {
    const { rows } = await query(
      'SELECT id, carrier_company_id, status FROM offers WHERE id = $1',
      [req.params.id]
    );
    const offer = rows[0];
    if (!offer) throw ApiError.notFound('Offer not found');
    if (offer.carrier_company_id !== req.user.companyId) {
      throw ApiError.forbidden('You can only withdraw your own offers');
    }
    if (offer.status !== 'pending') {
      throw ApiError.conflict(`This offer is ${offer.status} and can no longer be withdrawn`);
    }

    await query(`UPDATE offers SET status = 'withdrawn' WHERE id = $1`, [offer.id]);
    res.status(204).end();
  })
);
