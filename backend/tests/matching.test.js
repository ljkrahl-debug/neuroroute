import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  closePool,
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

async function scenario() {
  const shipper = await registerCompany(baseUrl, { name: 'Werk Süd', type: 'shipper', role: 'shipper' });
  const partner = await registerCompany(baseUrl, { name: 'Sped Nord', type: 'carrier', role: 'carrier' });
  const outsider = await registerCompany(baseUrl, { name: 'Fremd AG', type: 'carrier', role: 'carrier' });
  await shipper.client.post('/api/partners', { carrierCompanyId: partner.companyId });
  return { shipper, partner, outsider };
}

function requestPayload(extra = {}) {
  return {
    origin: 'Hamburg',
    destination: 'München',
    mode: 'road',
    cargo: 'Paletten',
    pickupDate: futureDate(6),
    ...extra,
  };
}

describe('partner exclusivity window', () => {
  it('shows a new request to preferred partners only', async () => {
    const { shipper, partner, outsider } = await scenario();

    const created = await shipper.client.post('/api/requests', requestPayload());
    assert.equal(created.status, 201);
    assert.equal(created.data.matching.visibility, 'partners_only');
    assert.equal(created.data.matching.partnerCount, 1);
    assert.ok(created.data.request.partnerExclusiveUntil);
    const requestId = created.data.request.id;

    // the partner sees it
    const partnerFeed = await partner.client.get('/api/requests');
    assert.ok(partnerFeed.data.requests.some((r) => r.id === requestId));

    // everyone else does not — not in the list …
    const outsiderFeed = await outsider.client.get('/api/requests');
    assert.ok(!outsiderFeed.data.requests.some((r) => r.id === requestId));

    // … not by id …
    assert.equal((await outsider.client.get(`/api/requests/${requestId}`)).status, 403);

    // … and not by bidding on it anyway.
    const sneaky = await outsider.client.post(`/api/requests/${requestId}/offers`, { price: 500 });
    assert.equal(sneaky.status, 403);
    assert.match(sneaky.data.error.message, /preferred partners/i);
  });

  it('opens to the whole network once the window passes', async () => {
    const { shipper, outsider } = await scenario();

    const requestId = (await shipper.client.post('/api/requests', requestPayload())).data.request.id;
    assert.equal((await outsider.client.get(`/api/requests/${requestId}`)).status, 403);

    // wind the clock past the window rather than waiting 24 hours for it
    await query(
      `UPDATE transport_requests SET partner_exclusive_until = now() - interval '1 minute' WHERE id = $1`,
      [requestId]
    );

    assert.equal((await outsider.client.get(`/api/requests/${requestId}`)).status, 200);
    const feed = await outsider.client.get('/api/requests');
    assert.ok(feed.data.requests.some((r) => r.id === requestId));
    assert.equal((await outsider.client.post(`/api/requests/${requestId}/offers`, { price: 500 })).status, 201);
  });

  it('lets the shipper release a request to the market early', async () => {
    const { shipper, outsider } = await scenario();
    const requestId = (await shipper.client.post('/api/requests', requestPayload())).data.request.id;

    assert.equal((await outsider.client.get(`/api/requests/${requestId}`)).status, 403);

    const opened = await shipper.client.post(`/api/requests/${requestId}/open-to-market`);
    assert.equal(opened.status, 200);
    assert.equal(opened.data.request.partnerExclusiveUntil, null);

    assert.equal((await outsider.client.get(`/api/requests/${requestId}`)).status, 200);

    // opening twice is a no-op worth reporting rather than silently accepting
    assert.equal((await shipper.client.post(`/api/requests/${requestId}/open-to-market`)).status, 409);
  });

  it('skips the window when the shipper has no partners at all', async () => {
    const shipper = await registerCompany(baseUrl, { name: 'Solo', type: 'shipper', role: 'shipper' });
    const carrier = await registerCompany(baseUrl, { name: 'Sped', type: 'carrier', role: 'carrier' });

    const created = await shipper.client.post('/api/requests', requestPayload());
    // Holding it back for nobody would just delay the transport.
    assert.equal(created.data.request.partnerExclusiveUntil, null);
    assert.equal(created.data.matching.visibility, 'open_market');
    assert.equal(created.data.matching.partnerCount, 0);

    const feed = await carrier.client.get('/api/requests');
    assert.ok(feed.data.requests.some((r) => r.id === created.data.request.id));
  });

  it('honours partnerExclusiveHours: 0 for an urgent transport', async () => {
    const { shipper, outsider } = await scenario();

    const created = await shipper.client.post(
      '/api/requests',
      requestPayload({ partnerExclusiveHours: 0 })
    );
    assert.equal(created.data.request.partnerExclusiveUntil, null);
    assert.equal((await outsider.client.get(`/api/requests/${created.data.request.id}`)).status, 200);
  });

  it('rejects an exclusivity window longer than a week', async () => {
    const { shipper } = await scenario();
    const res = await shipper.client.post('/api/requests', requestPayload({ partnerExclusiveHours: 500 }));
    assert.equal(res.status, 400);
  });

  it('still ranks partners first once everyone can see the request', async () => {
    const { shipper, partner, outsider } = await scenario();
    const requestId = (await shipper.client.post('/api/requests', requestPayload())).data.request.id;
    await query(`UPDATE transport_requests SET partner_exclusive_until = NULL WHERE id = $1`, [requestId]);

    await outsider.client.post(`/api/requests/${requestId}/offers`, { price: 800 });
    await partner.client.post(`/api/requests/${requestId}/offers`, { price: 950 });

    const offers = await shipper.client.get(`/api/requests/${requestId}/offers`);
    // The partner bid more and still comes first — that is the product decision.
    assert.equal(offers.data.offers[0].carrierCompanyId, partner.companyId);
    assert.equal(offers.data.offers[0].isPreferredPartner, true);
  });
});
