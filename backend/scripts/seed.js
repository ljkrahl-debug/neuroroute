#!/usr/bin/env node
/**
 * Development seed data, mirroring the demo scenario in the clickable
 * prototype (website/app.html): one shipper, one preferred carrier, one
 * outside carrier, a driver, and transports at every stage of the flow.
 *
 *   node scripts/seed.js
 *
 * Wipes the tables first, so it never runs against production.
 */
import { config } from '../src/config.js';
import { closePool, query, transaction } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';

if (config.isProduction) {
  console.error('Refusing to seed with NODE_ENV=production');
  process.exit(1);
}

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'neuroroute-demo-2026';

function daysFromNow(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const passwordHash = await hashPassword(DEMO_PASSWORD);

try {
  await query(`
    TRUNCATE marketplace_listings, capacity, offers, transport_requests,
             partners, sessions, users, companies RESTART IDENTITY CASCADE
  `);

  const seeded = await transaction(async (client) => {
    async function addCompany(name, type, status, city) {
      const { rows } = await client.query(
        `INSERT INTO companies (name, type, status, country, city)
         VALUES ($1, $2, $3, 'DE', $4) RETURNING id, name`,
        [name, type, status, city]
      );
      return rows[0];
    }

    async function addUser(companyId, email, name, role) {
      const { rows } = await client.query(
        `INSERT INTO users (company_id, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, email, role`,
        [companyId, email, passwordHash, name, role]
      );
      return rows[0];
    }

    const werkSued = await addCompany('Werk Süd GmbH', 'shipper', 'verified', 'München');
    const spedNord = await addCompany('Spedition Nord GmbH', 'carrier', 'verified', 'Hamburg');
    const fremdfracht = await addCompany('Fremdfracht AG', 'carrier', 'verified', 'Duisburg');
    const neuling = await addCompany('Neuling Logistik UG', 'carrier', 'pending', 'Leipzig');

    const admin = await client.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ('admin@neuroroute.com', $1, 'Platform Admin', 'admin') RETURNING id, email`,
      [passwordHash]
    );

    const shipperUser = await addUser(werkSued.id, 'abnehmer@demo.test', 'Sabine Verlader', 'shipper');
    const carrierUser = await addUser(spedNord.id, 'anbieter@demo.test', 'Luis Disponent', 'carrier');
    await addUser(spedNord.id, 'fahrer@demo.test', 'Franz Fahrer', 'driver');
    const externalUser = await addUser(fremdfracht.id, 'extern@demo.test', 'Erika Extern', 'carrier');
    await addUser(neuling.id, 'neuling@demo.test', 'Nico Neuling', 'carrier');

    // Werk Süd works with Spedition Nord first — the "own network" rule.
    await client.query(
      `INSERT INTO partners (shipper_company_id, carrier_company_id, note)
       VALUES ($1, $2, 'Rahmenvertrag 2026')`,
      [werkSued.id, spedNord.id]
    );

    async function addRequest(fields) {
      const { rows } = await client.query(
        `INSERT INTO transport_requests
           (shipper_company_id, created_by, origin, destination, mode, cargo,
            weight_kg, pickup_date, delivery_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, reference`,
        [
          werkSued.id,
          shipperUser.id,
          fields.origin,
          fields.destination,
          fields.mode,
          fields.cargo,
          fields.weightKg,
          fields.pickupDate,
          fields.deliveryDate ?? null,
          fields.notes ?? null,
        ]
      );
      return rows[0];
    }

    // 1. open, no offers yet
    const openRequest = await addRequest({
      origin: 'München',
      destination: 'Hamburg',
      mode: 'road',
      cargo: '18 Paletten Maschinenteile',
      weightKg: 12400,
      pickupDate: daysFromNow(6),
      deliveryDate: daysFromNow(8),
    });

    // 2. open, two offers waiting for a decision
    const contested = await addRequest({
      origin: 'Stuttgart',
      destination: 'Rotterdam',
      mode: 'multimodal',
      cargo: '2 x 40ft Container',
      weightKg: 41000,
      pickupDate: daysFromNow(10),
      notes: 'Umschlag Duisburg möglich',
    });

    async function addOffer(requestId, companyId, userId, priceCents, message) {
      const { rows } = await client.query(
        `INSERT INTO offers (request_id, carrier_company_id, created_by, price_cents, message)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [requestId, companyId, userId, priceCents, message]
      );
      return rows[0];
    }

    await addOffer(contested.id, spedNord.id, carrierUser.id, 289000, 'Abholung Montag früh möglich');
    await addOffer(contested.id, fremdfracht.id, externalUser.id, 274500, 'Inkl. Zollabwicklung');

    // 3. already assigned, so the dashboards are not empty
    const assigned = await addRequest({
      origin: 'Hamburg',
      destination: 'Wien',
      mode: 'rail',
      cargo: '24 Paletten Elektronik',
      weightKg: 9800,
      pickupDate: daysFromNow(-2),
      deliveryDate: daysFromNow(1),
    });
    const winning = await addOffer(assigned.id, spedNord.id, carrierUser.id, 198000, 'Bahnslot gebucht');
    await client.query(`UPDATE offers SET status = 'accepted' WHERE id = $1`, [winning.id]);
    await client.query(
      `UPDATE transport_requests
          SET status = 'assigned', accepted_offer_id = $2,
              carrier_company_id = $3, accepted_price_cents = 198000
        WHERE id = $1`,
      [assigned.id, winning.id, spedNord.id]
    );

    // Capacity and marketplace rows: the endpoints for these are Phase 2, but
    // the data makes the empty-run case visible while building them.
    const { rows: capacityRows } = await client.query(
      `INSERT INTO capacity
         (carrier_company_id, created_by, origin, destination, mode, depart_date,
          capacity_desc, utilization_pct, recurring, return_empty)
       VALUES
         ($1, $2, 'Hamburg', 'München', 'road', $3, 'Sattelzug 24t', 95, true, false),
         ($1, $2, 'München', 'Hamburg', 'road', $4, 'Sattelzug 24t', 0, true, true)
       RETURNING id, return_empty`,
      [spedNord.id, carrierUser.id, daysFromNow(4), daysFromNow(5)]
    );
    const emptyLeg = capacityRows.find((r) => r.return_empty);

    await client.query(
      `INSERT INTO marketplace_listings
         (company_id, capacity_id, origin, destination, mode, detail,
          price_cents, list_price_cents, available_from, available_to)
       VALUES ($1, $2, 'München', 'Hamburg', 'road',
               'Leerfahrt Rückweg, 24t Sattelzug frei', 68000, 110000, $3, $4)`,
      [spedNord.id, emptyLeg.id, daysFromNow(5), daysFromNow(5)]
    );

    return {
      admin: admin.rows[0].email,
      companies: [werkSued, spedNord, fremdfracht, neuling].map((c) => c.name),
      requests: [openRequest.reference, contested.reference, assigned.reference],
    };
  });

  console.log('Seeded the development database.\n');
  console.log(`  Companies: ${seeded.companies.join(', ')}`);
  console.log(`  Requests:  ${seeded.requests.join(', ')}\n`);
  console.log('  Sign in with any of these — all share the same password:\n');
  console.log('    admin@neuroroute.com   platform admin');
  console.log('    abnehmer@demo.test     shipper  (Werk Süd GmbH)');
  console.log('    anbieter@demo.test     carrier  (Spedition Nord, preferred partner)');
  console.log('    extern@demo.test       carrier  (Fremdfracht AG, outside the network)');
  console.log('    fahrer@demo.test       driver   (Spedition Nord)');
  console.log('    neuling@demo.test      carrier  (not verified yet — for testing the gate)');
  console.log(`\n    password: ${DEMO_PASSWORD}`);
} finally {
  await closePool();
}
