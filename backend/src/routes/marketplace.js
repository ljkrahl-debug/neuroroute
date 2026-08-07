import { Router } from 'express';

import { query } from '../db.js';
import { ApiError, asyncRoute } from '../lib/errors.js';
import { body, isoDate, priceToCents, shortText, transportMode, z } from '../lib/validate.js';
import { requireAuth, requireRole, requireVerifiedCompany } from '../auth/middleware.js';

export const marketplaceRouter = Router();

marketplaceRouter.use(requireAuth, requireVerifiedCompany);

const LISTING_COLUMNS = `
  l.id               AS "id",
  l.company_id       AS "companyId",
  l.capacity_id      AS "capacityId",
  l.origin           AS "origin",
  l.destination      AS "destination",
  l.mode             AS "mode",
  l.detail           AS "detail",
  l.price_cents      AS "priceCents",
  l.list_price_cents AS "listPriceCents",
  l.discount_pct     AS "discountPct",
  l.currency         AS "currency",
  l.available_from   AS "availableFrom",
  l.available_to     AS "availableTo",
  l.status           AS "status",
  l.created_at       AS "createdAt"
`;

const listingSchema = z
  .object({
    origin: shortText(200),
    destination: shortText(200),
    mode: transportMode,
    detail: shortText(500).optional(),
    price: priceToCents,
    // the normal rate, so the marketplace can show what the discount is
    listPrice: priceToCents.optional(),
    availableFrom: isoDate.optional(),
    availableTo: isoDate.optional(),
  })
  .refine((v) => v.listPrice === undefined || v.listPrice >= v.price, {
    message: 'The normal price cannot be lower than the offered price',
    path: ['listPrice'],
  })
  .refine((v) => !v.availableTo || !v.availableFrom || v.availableTo >= v.availableFrom, {
    message: 'availableTo cannot be before availableFrom',
    path: ['availableTo'],
  });

async function insertListing(companyId, input, capacityId = null) {
  const { rows } = await query(
    `INSERT INTO marketplace_listings
       (company_id, capacity_id, origin, destination, mode, detail,
        price_cents, list_price_cents, available_from, available_to)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, company_id AS "companyId", capacity_id AS "capacityId",
               origin, destination, mode, detail,
               price_cents AS "priceCents", list_price_cents AS "listPriceCents",
               discount_pct AS "discountPct", currency,
               available_from AS "availableFrom", available_to AS "availableTo",
               status, created_at AS "createdAt"`,
    [
      companyId,
      capacityId,
      input.origin,
      input.destination,
      input.mode,
      input.detail ?? null,
      input.price,
      input.listPrice ?? null,
      input.availableFrom ?? null,
      input.availableTo ?? null,
    ]
  );
  return rows[0];
}

/**
 * Browse free capacity. Open to shippers and carriers alike — a forwarder
 * buying someone else's empty return is exactly the point.
 */
marketplaceRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const { origin, destination, mode, from, to, mine } = req.query;

    const { rows } = await query(
      `SELECT ${LISTING_COLUMNS}, c.name AS "companyName", c.country AS "companyCountry"
         FROM marketplace_listings l
         JOIN companies c ON c.id = l.company_id
        WHERE (l.status = 'active' OR ($6 = 'true' AND l.company_id = $7))
          AND ($1 = '' OR l.origin ILIKE '%' || $1 || '%')
          AND ($2 = '' OR l.destination ILIKE '%' || $2 || '%')
          AND ($3::text IS NULL OR l.mode = $3)
          AND ($4::date IS NULL OR l.available_to IS NULL OR l.available_to >= $4)
          AND ($5::date IS NULL OR l.available_from IS NULL OR l.available_from <= $5)
        ORDER BY l.discount_pct DESC NULLS LAST, l.created_at DESC
        LIMIT 200`,
      [
        typeof origin === 'string' ? origin.trim() : '',
        typeof destination === 'string' ? destination.trim() : '',
        typeof mode === 'string' ? mode : null,
        typeof from === 'string' ? from : null,
        typeof to === 'string' ? to : null,
        mine === 'true' ? 'true' : 'false',
        req.user.companyId,
      ]
    );

    res.json({ listings: rows });
  })
);

/** Publish free capacity that is not tied to a planned leg. */
marketplaceRouter.post(
  '/',
  requireRole('carrier', 'admin'),
  asyncRoute(async (req, res) => {
    const input = body(listingSchema, req);
    const listing = await insertListing(req.user.companyId, input);
    res.status(201).json({ listing });
  })
);

marketplaceRouter.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const { rows } = await query(
      `SELECT ${LISTING_COLUMNS}, c.name AS "companyName"
         FROM marketplace_listings l
         JOIN companies c ON c.id = l.company_id
        WHERE l.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) throw ApiError.notFound('Listing not found');
    res.json({ listing: rows[0] });
  })
);

/**
 * Book someone else's free capacity.
 *
 * The update is conditional on the listing still being active, so two buyers
 * clicking at the same moment cannot both win it: the second one changes no
 * rows and gets a 409.
 */
marketplaceRouter.post(
  '/:id/book',
  asyncRoute(async (req, res) => {
    const { rows: existing } = await query(
      'SELECT id, company_id, status FROM marketplace_listings WHERE id = $1',
      [req.params.id]
    );
    const listing = existing[0];
    if (!listing) throw ApiError.notFound('Listing not found');
    if (listing.company_id === req.user.companyId) {
      throw ApiError.badRequest('You cannot book your own capacity');
    }

    const { rows } = await query(
      `UPDATE marketplace_listings
          SET status = 'booked', booked_by_company_id = $2, booked_by_user_id = $3, booked_at = now()
        WHERE id = $1 AND status = 'active'
        RETURNING id, status, origin, destination, mode,
                  price_cents AS "priceCents", currency,
                  booked_at AS "bookedAt"`,
      [req.params.id, req.user.companyId, req.user.id]
    );

    if (rows.length === 0) {
      throw ApiError.conflict('This capacity has just been booked by someone else');
    }

    res.json({ listing: rows[0] });
  })
);

/** Take a listing off the marketplace again. */
marketplaceRouter.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const { rows } = await query(
      'SELECT company_id, status FROM marketplace_listings WHERE id = $1',
      [req.params.id]
    );
    const listing = rows[0];
    if (!listing) throw ApiError.notFound('Listing not found');
    if (listing.company_id !== req.user.companyId && req.user.role !== 'admin') {
      throw ApiError.forbidden('You can only withdraw your own listings');
    }
    if (listing.status === 'booked') {
      throw ApiError.conflict('This capacity is already booked and cannot be withdrawn');
    }

    await query(`UPDATE marketplace_listings SET status = 'expired' WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  })
);

/**
 * The one-click publish from the capacity planner: turns a planned leg into a
 * marketplace listing, carrying the route over so the carrier only has to name
 * a price.
 */
export const capacityPublishRouter = Router({ mergeParams: true });

capacityPublishRouter.use(requireAuth, requireRole('carrier', 'admin'), requireVerifiedCompany);

capacityPublishRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const input = body(
      z.object({
        price: priceToCents,
        listPrice: priceToCents.optional(),
        detail: shortText(500).optional(),
        availableTo: isoDate.optional(),
      }),
      req
    );

    const { rows } = await query(
      `SELECT id, carrier_company_id, origin, destination, mode, depart_date, capacity_desc
         FROM capacity WHERE id = $1`,
      [req.params.capacityId]
    );
    const leg = rows[0];
    if (!leg) throw ApiError.notFound('Capacity entry not found');
    if (leg.carrier_company_id !== req.user.companyId) {
      throw ApiError.forbidden('You can only publish your own capacity');
    }
    if (input.listPrice !== undefined && input.listPrice < input.price) {
      throw ApiError.badRequest('The normal price cannot be lower than the offered price');
    }

    try {
      const listing = await insertListing(
        req.user.companyId,
        {
          origin: leg.origin,
          destination: leg.destination,
          mode: leg.mode,
          detail: input.detail ?? leg.capacity_desc ?? null,
          price: input.price,
          listPrice: input.listPrice,
          availableFrom: leg.depart_date,
          availableTo: input.availableTo ?? leg.depart_date,
        },
        leg.id
      );
      res.status(201).json({ listing });
    } catch (err) {
      // listings_one_active_per_capacity
      if (err.code === '23505') {
        throw ApiError.conflict('This capacity is already on the marketplace');
      }
      throw err;
    }
  })
);
