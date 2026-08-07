-- Neuroroute schema, Phase 1.
--
-- Covers the tables named in CLAUDE.md (users, companies, requests, offers,
-- capacity, marketplace_listings) plus sessions and the preferred-partner list
-- that the "use your own network first" matching needs.
--
-- Money is stored as integer cents in bigint columns. Never floats: 0.1 + 0.2
-- is not 0.3 and freight rates end up in invoices.

-- ---------------------------------------------------------------- companies

CREATE TABLE companies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 200),
  -- what the company does on the platform; "both" is common for forwarders
  -- who buy transport as well as sell it
  type         text NOT NULL CHECK (type IN ('shipper', 'carrier', 'both')),
  -- an admin verifies a company before it may trade
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  country      text,
  city         text,
  vat_id       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX companies_status_idx ON companies (status);

-- -------------------------------------------------------------------- users

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid REFERENCES companies (id) ON DELETE RESTRICT,
  -- stored lowercased so the unique index is genuinely case-insensitive
  email         text NOT NULL CHECK (email = lower(email) AND position('@' IN email) > 1),
  password_hash text NOT NULL,
  name          text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  role          text NOT NULL CHECK (role IN ('admin', 'carrier', 'shipper', 'driver')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- platform admins are the only users that belong to no company
  CONSTRAINT users_company_required CHECK (role = 'admin' OR company_id IS NOT NULL)
);

CREATE UNIQUE INDEX users_email_key ON users (email);
CREATE INDEX users_company_id_idx ON users (company_id);

-- ----------------------------------------------------------------- sessions

-- Only the SHA-256 of the session token is stored. A database leak therefore
-- does not hand out usable sessions.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip         inet
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- ----------------------------------------------------------------- partners

-- The heart of "use your own network first": a shipper's preferred carriers.
CREATE TABLE partners (
  shipper_company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  carrier_company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shipper_company_id, carrier_company_id),
  CONSTRAINT partners_distinct CHECK (shipper_company_id <> carrier_company_id)
);

CREATE INDEX partners_carrier_idx ON partners (carrier_company_id);

-- -------------------------------------------------------- transport requests

-- Human-readable reference, like the prototype's NR-2026-00001.
CREATE SEQUENCE request_reference_seq;

CREATE TABLE transport_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference            text NOT NULL UNIQUE
                         DEFAULT 'NR-' || to_char(now(), 'YYYY') || '-'
                                 || lpad(nextval('request_reference_seq')::text, 5, '0'),
  shipper_company_id   uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  created_by           uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  origin               text NOT NULL CHECK (length(btrim(origin)) > 0),
  destination          text NOT NULL CHECK (length(btrim(destination)) > 0),
  mode                 text NOT NULL CHECK (mode IN ('road', 'rail', 'sea', 'air', 'multimodal')),
  cargo                text NOT NULL CHECK (length(btrim(cargo)) > 0),
  weight_kg            numeric(12, 2) CHECK (weight_kg IS NULL OR weight_kg > 0),
  pickup_date          date NOT NULL,
  delivery_date        date,
  notes                text,
  status               text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'assigned', 'in_transit', 'delivered', 'cancelled')),
  -- set together when an offer is accepted; the FK is added after offers exists
  accepted_offer_id    uuid,
  carrier_company_id   uuid REFERENCES companies (id) ON DELETE RESTRICT,
  accepted_price_cents bigint CHECK (accepted_price_cents IS NULL OR accepted_price_cents > 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT requests_dates CHECK (delivery_date IS NULL OR delivery_date >= pickup_date),

  -- a request is either unassigned or fully assigned; no half state where a
  -- carrier is set but the winning offer is not
  CONSTRAINT requests_assignment_consistent CHECK (
    (status IN ('open', 'cancelled')
       AND accepted_offer_id IS NULL AND carrier_company_id IS NULL AND accepted_price_cents IS NULL)
    OR
    (status IN ('assigned', 'in_transit', 'delivered')
       AND accepted_offer_id IS NOT NULL AND carrier_company_id IS NOT NULL AND accepted_price_cents IS NOT NULL)
  )
);

CREATE INDEX requests_shipper_idx ON transport_requests (shipper_company_id, created_at DESC);
CREATE INDEX requests_status_idx ON transport_requests (status, created_at DESC);
CREATE INDEX requests_carrier_idx ON transport_requests (carrier_company_id);

-- ------------------------------------------------------------------- offers

CREATE TABLE offers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id         uuid NOT NULL REFERENCES transport_requests (id) ON DELETE CASCADE,
  carrier_company_id uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  created_by         uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  price_cents        bigint NOT NULL CHECK (price_cents > 0),
  currency           char(3) NOT NULL DEFAULT 'EUR' CHECK (currency = upper(currency)),
  message            text,
  valid_until        date,
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- A carrier has at most one live offer per request. Withdrawn and rejected
-- offers stay in the table as history and are excluded, so a carrier can
-- withdraw and bid again.
CREATE UNIQUE INDEX offers_one_live_per_carrier
  ON offers (request_id, carrier_company_id)
  WHERE status IN ('pending', 'accepted');

-- The invariant that makes double acceptance impossible even under a race:
-- two concurrent accepts cannot both insert an 'accepted' row for one request.
CREATE UNIQUE INDEX offers_one_accepted_per_request
  ON offers (request_id)
  WHERE status = 'accepted';

CREATE INDEX offers_request_idx ON offers (request_id, created_at DESC);
CREATE INDEX offers_carrier_idx ON offers (carrier_company_id, created_at DESC);

ALTER TABLE transport_requests
  ADD CONSTRAINT requests_accepted_offer_fk
  FOREIGN KEY (accepted_offer_id) REFERENCES offers (id) ON DELETE RESTRICT;

-- ----------------------------------------------------------------- capacity

-- Planned transports a carrier enters, used to spot empty runs. The endpoints
-- for this land in Phase 2; the table is here because the schema in CLAUDE.md
-- names it and later migrations are easier when the shape is settled.
CREATE TABLE capacity (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  created_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  origin             text NOT NULL,
  destination        text NOT NULL,
  mode               text NOT NULL CHECK (mode IN ('road', 'rail', 'sea', 'air', 'multimodal')),
  depart_date        date NOT NULL,
  capacity_desc      text,
  utilization_pct    smallint CHECK (utilization_pct BETWEEN 0 AND 100),
  recurring          boolean NOT NULL DEFAULT false,
  -- the flag that drives the empty-run suggestion
  return_empty       boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX capacity_carrier_idx ON capacity (carrier_company_id, depart_date);
CREATE INDEX capacity_return_empty_idx ON capacity (return_empty) WHERE return_empty;

-- ------------------------------------------------------ marketplace listings

CREATE TABLE marketplace_listings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  capacity_id      uuid REFERENCES capacity (id) ON DELETE SET NULL,
  origin           text NOT NULL,
  destination      text NOT NULL,
  mode             text NOT NULL CHECK (mode IN ('road', 'rail', 'sea', 'air', 'multimodal')),
  detail           text,
  price_cents      bigint NOT NULL CHECK (price_cents > 0),
  -- the normal rate, so the discount can be shown
  list_price_cents bigint CHECK (list_price_cents IS NULL OR list_price_cents >= price_cents),
  currency         char(3) NOT NULL DEFAULT 'EUR',
  available_from   date,
  available_to     date,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'booked', 'expired')),
  discount_pct     smallint GENERATED ALWAYS AS (
                     CASE
                       WHEN list_price_cents IS NULL OR list_price_cents = 0 THEN NULL
                       ELSE round((1 - price_cents::numeric / list_price_cents) * 100)
                     END
                   ) STORED,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT listings_dates CHECK (available_to IS NULL OR available_from IS NULL OR available_to >= available_from)
);

CREATE INDEX listings_status_idx ON marketplace_listings (status, created_at DESC);
CREATE INDEX listings_company_idx ON marketplace_listings (company_id);

-- --------------------------------------------------------------- updated_at

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER requests_updated_at BEFORE UPDATE ON transport_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER offers_updated_at BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER capacity_updated_at BEFORE UPDATE ON capacity
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER listings_updated_at BEFORE UPDATE ON marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
