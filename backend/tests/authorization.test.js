import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  PASSWORD,
  closePool,
  createAdmin,
  createClient,
  futureDate,
  query,
  registerCompany,
  resetDb,
  startServer,
} from './helpers.js';

let server;
let baseUrl;

before(async () => {
  server = await startServer();
  baseUrl = server.baseUrl;
});

after(async () => {
  await server.close();
  await closePool();
});

beforeEach(resetDb);

async function openRequest(shipper, overrides = {}) {
  const res = await shipper.client.post('/api/requests', {
    origin: 'Hamburg',
    destination: 'München',
    mode: 'road',
    cargo: 'Paletten',
    pickupDate: futureDate(5),
    ...overrides,
  });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data.request;
}

describe('role boundaries', () => {
  it('does not let a carrier post a transport request', async () => {
    const carrier = await registerCompany(baseUrl, { name: 'Sped', type: 'carrier', role: 'carrier' });
    const res = await carrier.client.post('/api/requests', {
      origin: 'Hamburg',
      destination: 'Berlin',
      mode: 'road',
      cargo: 'Paletten',
      pickupDate: futureDate(3),
    });
    assert.equal(res.status, 403);
  });

  it('does not let a shipper make an offer', async () => {
    const shipperA = await registerCompany(baseUrl, { name: 'Werk A', type: 'shipper', role: 'shipper' });
    const shipperB = await registerCompany(baseUrl, { name: 'Werk B', type: 'shipper', role: 'shipper' });
    const request = await openRequest(shipperA);

    const res = await shipperB.client.post(`/api/requests/${request.id}/offers`, { price: 500 });
    assert.equal(res.status, 403);
  });

  it('does not let a driver trade', async () => {
    const carrier = await registerCompany(baseUrl, { name: 'Sped', type: 'carrier', role: 'carrier' });
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });
    const request = await openRequest(shipper);

    const created = await carrier.client.post('/api/users', {
      name: 'Fahrer Franz',
      email: 'franz@sped.test',
      password: PASSWORD,
      role: 'driver',
    });
    assert.equal(created.status, 201);

    const driver = createClient(baseUrl);
    await driver.post('/api/auth/login', { email: 'franz@sped.test', password: PASSWORD });

    assert.equal((await driver.post(`/api/requests/${request.id}/offers`, { price: 100 })).status, 403);
    assert.equal(
      (
        await driver.post('/api/requests', {
          origin: 'A',
          destination: 'B',
          mode: 'road',
          cargo: 'x',
          pickupDate: futureDate(2),
        })
      ).status,
      403
    );
  });

  it('keeps admin endpoints away from everyone else', async () => {
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });
    const carrier = await registerCompany(baseUrl, { name: 'Sped', type: 'carrier', role: 'carrier' });

    for (const client of [shipper.client, carrier.client, createClient(baseUrl)]) {
      const res = await client.get('/api/admin/companies');
      assert.ok(res.status === 401 || res.status === 403, `expected denial, got ${res.status}`);
    }
  });

  it('does not let a company create users outside its own roles or company', async () => {
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });
    const carrier = await registerCompany(baseUrl, { name: 'Sped', type: 'carrier', role: 'carrier' });

    // a shipper cannot mint carrier accounts
    assert.equal(
      (
        await shipper.client.post('/api/users', {
          name: 'X',
          email: 'x@test.test',
          password: PASSWORD,
          role: 'carrier',
        })
      ).status,
      403
    );

    // and a carrier cannot plant a user in someone else's company
    const res = await carrier.client.post('/api/users', {
      name: 'Y',
      email: 'y@test.test',
      password: PASSWORD,
      role: 'driver',
      companyId: shipper.companyId,
    });
    assert.equal(res.status, 201);
    const { rows } = await query('SELECT company_id FROM users WHERE email = $1', ['y@test.test']);
    assert.equal(
      rows[0].company_id,
      carrier.companyId,
      'companyId in the body must be ignored for non-admins'
    );
  });
});

describe('ownership boundaries', () => {
  it('hides one shipper’s request from another', async () => {
    const shipperA = await registerCompany(baseUrl, { name: 'Werk A', type: 'shipper', role: 'shipper' });
    const shipperB = await registerCompany(baseUrl, { name: 'Werk B', type: 'shipper', role: 'shipper' });
    const request = await openRequest(shipperA);

    assert.equal((await shipperB.client.get(`/api/requests/${request.id}`)).status, 403);
    const list = await shipperB.client.get('/api/requests');
    assert.equal(list.data.requests.length, 0);
  });

  it('does not let a carrier bid on its own company’s request', async () => {
    // A forwarder is both shipper and carrier, so this is a real situation.
    const forwarder = await registerCompany(baseUrl, {
      name: 'Spedition Doppelrolle',
      type: 'both',
      role: 'shipper',
    });
    const request = await openRequest(forwarder);

    // The shipper-side owner cannot mint a carrier account, not even for its
    // own company — that separation is the point of CAN_CREATE.
    const carrierSide = await forwarder.client.post('/api/users', {
      name: 'Disponent',
      email: 'dispo@doppel.test',
      password: PASSWORD,
      role: 'carrier',
    });
    assert.equal(carrierSide.status, 403);

    // Set one up directly, the way an admin would, and bid from it.
    await query(
      `INSERT INTO users (company_id, email, password_hash, name, role)
       SELECT $1, 'dispo2@doppel.test', password_hash, 'Disponent', 'carrier'
         FROM users WHERE id = $2`,
      [forwarder.companyId, forwarder.userId]
    );
    const dispo = createClient(baseUrl);
    await dispo.post('/api/auth/login', { email: 'dispo2@doppel.test', password: PASSWORD });

    const res = await dispo.post(`/api/requests/${request.id}/offers`, { price: 700 });
    assert.equal(res.status, 400);
    assert.match(res.data.error.message, /own request/i);
  });

  it('does not let a stranger accept an offer on someone else’s request', async () => {
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });
    const otherShipper = await registerCompany(baseUrl, {
      name: 'Fremd',
      type: 'shipper',
      role: 'shipper',
    });
    const carrier = await registerCompany(baseUrl, { name: 'Sped', type: 'carrier', role: 'carrier' });

    const request = await openRequest(shipper);
    const offer = (await carrier.client.post(`/api/requests/${request.id}/offers`, { price: 800 }))
      .data.offer;

    const res = await otherShipper.client.post(`/api/offers/${offer.id}/accept`);
    assert.equal(res.status, 403);

    const fresh = await shipper.client.get(`/api/requests/${request.id}`);
    assert.equal(fresh.data.request.status, 'open', 'the request must be untouched');
  });

  it('does not show a carrier what its competitors bid', async () => {
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });
    const carrierA = await registerCompany(baseUrl, { name: 'Sped A', type: 'carrier', role: 'carrier' });
    const carrierB = await registerCompany(baseUrl, { name: 'Sped B', type: 'carrier', role: 'carrier' });

    const request = await openRequest(shipper);
    await carrierA.client.post(`/api/requests/${request.id}/offers`, { price: 1000 });
    await carrierB.client.post(`/api/requests/${request.id}/offers`, { price: 900 });

    const seenByA = await carrierA.client.get(`/api/requests/${request.id}/offers`);
    assert.equal(seenByA.status, 200);
    assert.equal(seenByA.data.offers.length, 1);
    assert.equal(seenByA.data.offers[0].carrierCompanyId, carrierA.companyId);

    // the shipper does see both
    const seenByShipper = await shipper.client.get(`/api/requests/${request.id}/offers`);
    assert.equal(seenByShipper.data.offers.length, 2);
  });

  it('does not let a carrier withdraw someone else’s offer', async () => {
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });
    const carrierA = await registerCompany(baseUrl, { name: 'Sped A', type: 'carrier', role: 'carrier' });
    const carrierB = await registerCompany(baseUrl, { name: 'Sped B', type: 'carrier', role: 'carrier' });

    const request = await openRequest(shipper);
    const offer = (await carrierA.client.post(`/api/requests/${request.id}/offers`, { price: 1000 }))
      .data.offer;

    assert.equal((await carrierB.client.post(`/api/offers/${offer.id}/withdraw`)).status, 403);
  });
});

describe('state machine', () => {
  it('accepts exactly one offer, even when two accepts race', async () => {
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });
    const carrierA = await registerCompany(baseUrl, { name: 'Sped A', type: 'carrier', role: 'carrier' });
    const carrierB = await registerCompany(baseUrl, { name: 'Sped B', type: 'carrier', role: 'carrier' });

    const request = await openRequest(shipper);
    const offerA = (await carrierA.client.post(`/api/requests/${request.id}/offers`, { price: 1000 }))
      .data.offer;
    const offerB = (await carrierB.client.post(`/api/requests/${request.id}/offers`, { price: 900 }))
      .data.offer;

    // Two tabs, same shipper, different offers, at the same moment.
    const [resA, resB] = await Promise.all([
      shipper.client.post(`/api/offers/${offerA.id}/accept`),
      shipper.client.post(`/api/offers/${offerB.id}/accept`),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [200, 409], 'exactly one accept must win');

    const { rows } = await query(
      `SELECT count(*)::int AS accepted FROM offers WHERE request_id = $1 AND status = 'accepted'`,
      [request.id]
    );
    assert.equal(rows[0].accepted, 1);

    const fresh = await shipper.client.get(`/api/requests/${request.id}`);
    assert.equal(fresh.data.request.status, 'assigned');
  });

  it('refuses a second acceptance after the request is assigned', async () => {
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });
    const carrierA = await registerCompany(baseUrl, { name: 'Sped A', type: 'carrier', role: 'carrier' });
    const carrierB = await registerCompany(baseUrl, { name: 'Sped B', type: 'carrier', role: 'carrier' });

    const request = await openRequest(shipper);
    const offerA = (await carrierA.client.post(`/api/requests/${request.id}/offers`, { price: 1000 }))
      .data.offer;
    const offerB = (await carrierB.client.post(`/api/requests/${request.id}/offers`, { price: 900 }))
      .data.offer;

    assert.equal((await shipper.client.post(`/api/offers/${offerA.id}/accept`)).status, 200);
    const second = await shipper.client.post(`/api/offers/${offerB.id}/accept`);
    assert.equal(second.status, 409);
  });

  it('refuses offers on a request that is no longer open', async () => {
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });
    const carrierA = await registerCompany(baseUrl, { name: 'Sped A', type: 'carrier', role: 'carrier' });
    const carrierB = await registerCompany(baseUrl, { name: 'Sped B', type: 'carrier', role: 'carrier' });

    const request = await openRequest(shipper);
    const offerA = (await carrierA.client.post(`/api/requests/${request.id}/offers`, { price: 1000 }))
      .data.offer;
    await shipper.client.post(`/api/offers/${offerA.id}/accept`);

    const late = await carrierB.client.post(`/api/requests/${request.id}/offers`, { price: 500 });
    assert.equal(late.status, 409);
  });

  it('refuses to accept a withdrawn offer', async () => {
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });
    const carrier = await registerCompany(baseUrl, { name: 'Sped', type: 'carrier', role: 'carrier' });

    const request = await openRequest(shipper);
    const offer = (await carrier.client.post(`/api/requests/${request.id}/offers`, { price: 800 }))
      .data.offer;
    await carrier.client.post(`/api/offers/${offer.id}/withdraw`);

    const res = await shipper.client.post(`/api/offers/${offer.id}/accept`);
    assert.equal(res.status, 409);
  });

  it('rejects a nonsensical price', async () => {
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });
    const carrier = await registerCompany(baseUrl, { name: 'Sped', type: 'carrier', role: 'carrier' });
    const request = await openRequest(shipper);

    for (const price of [0, -100]) {
      const res = await carrier.client.post(`/api/requests/${request.id}/offers`, { price });
      assert.equal(res.status, 400, `price ${price} should be rejected`);
    }
  });

  it('rejects a delivery date before the pickup date', async () => {
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });
    const res = await shipper.client.post('/api/requests', {
      origin: 'Hamburg',
      destination: 'Berlin',
      mode: 'road',
      cargo: 'Paletten',
      pickupDate: futureDate(10),
      deliveryDate: futureDate(3),
    });
    assert.equal(res.status, 400);
  });
});

describe('account lifecycle', () => {
  it('logs a user out immediately when they are disabled', async () => {
    const carrier = await registerCompany(baseUrl, { name: 'Sped', type: 'carrier', role: 'carrier' });
    await carrier.client.post('/api/users', {
      name: 'Fahrer',
      email: 'fahrer@sped.test',
      password: PASSWORD,
      role: 'driver',
    });

    const driver = createClient(baseUrl);
    await driver.post('/api/auth/login', { email: 'fahrer@sped.test', password: PASSWORD });
    assert.equal((await driver.get('/api/auth/me')).status, 200);

    const { rows } = await query('SELECT id FROM users WHERE email = $1', ['fahrer@sped.test']);
    assert.equal((await carrier.client.post(`/api/users/${rows[0].id}/disable`)).status, 204);

    assert.equal((await driver.get('/api/auth/me')).status, 401);
  });

  it('does not let anyone disable themselves', async () => {
    const admin = await createAdmin(baseUrl);
    const me = await admin.client.get('/api/auth/me');
    const res = await admin.client.post(`/api/users/${me.data.user.id}/disable`);
    assert.equal(res.status, 400);
  });
});
