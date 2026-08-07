-- Phase 2: the partner exclusivity window and marketplace bookings.

-- ------------------------------------------------- partner exclusivity window

-- "Use your own network first", enforced rather than merely sorted: until this
-- moment a request is visible only to the shipper's preferred partners. NULL
-- means it went to the open market immediately — which is also what happens
-- when a shipper has no partners yet.
ALTER TABLE transport_requests
  ADD COLUMN partner_exclusive_until timestamptz;

-- The carrier feed filters on this constantly, and only open requests matter.
CREATE INDEX requests_exclusive_idx
  ON transport_requests (partner_exclusive_until)
  WHERE status = 'open';

-- ------------------------------------------------------ marketplace bookings

ALTER TABLE marketplace_listings
  ADD COLUMN booked_by_company_id uuid REFERENCES companies (id) ON DELETE SET NULL,
  ADD COLUMN booked_by_user_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN booked_at            timestamptz;

-- A booked listing records who booked it; an active one must not pretend to be
-- booked. Keeps the two columns from drifting apart.
ALTER TABLE marketplace_listings
  ADD CONSTRAINT listings_booking_consistent CHECK (
    (status = 'booked' AND booked_by_company_id IS NOT NULL AND booked_at IS NOT NULL)
    OR (status <> 'booked' AND booked_by_company_id IS NULL AND booked_at IS NULL)
  );

-- A capacity leg is published at most once while the listing is live. Republish
-- is possible after the old listing expires or is withdrawn.
CREATE UNIQUE INDEX listings_one_active_per_capacity
  ON marketplace_listings (capacity_id)
  WHERE capacity_id IS NOT NULL AND status = 'active';

-- Browsing the marketplace is a route search, so index the way it is queried.
CREATE INDEX listings_search_idx
  ON marketplace_listings (mode, available_from)
  WHERE status = 'active';
