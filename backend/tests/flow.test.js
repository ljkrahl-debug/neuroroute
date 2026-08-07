import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  closePool,
  createAdmin,
  futureDate,
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

describe('the core flow: request, offer, acceptance', () => {
  it('carries a transport from posting to assignment across all four roles', async () => {
    const shipper = await registerCompany(baseUrl, {
      name: 'Werk Süd GmbH',
      type: 'shipper',
      role: 'shipper',
    });
    const partnerCarrier = await registerCompany(baseUrl, {
      name: 'Spedition Nord',
      type: 'carrier',
      role: 'carrier',
    });
    const externalCarrier = await registerCompany(baseUrl, {
      name: 'Fremdfracht AG',
      type: 'carrier',
      role: 'carrier',
    });
    const admin = await createAdmin(baseUrl);

    // The shipper keeps a preferred partner list — the point of the platform.
    const addPartner = await shipper.client.post('/api/partners', {
      carrierCompanyId: partnerCarrier.companyId,
      note: 'Hauptpartner Nord',
    });
    assert.equal(addPartner.status, 201);

    // 1. shipper posts the transport
    const created = await shipper.client.post('/api/requests', {
      origin: 'Hamburg',
      destination: 'München',
      mode: 'road',
      cargo: '18 Paletten Maschinenteile',
      weightKg: 12400,
      pickupDate: futureDate(5),
      deliveryDate: futureDate(7),
    });
    assert.equal(created.status, 201);
    const request = created.data.request;
    assert.equal(request.status, 'open');
    assert.match(request.reference, /^NR-\d{4}-\d{5}$/);

    // 2. both carriers see it; the preferred partner is flagged and ranked first
    const partnerFeed = await partnerCarrier.client.get('/api/requests');
    assert.equal(partnerFeed.status, 200);
    const seenByPartner = partnerFeed.data.requests.find((r) => r.id === request.id);
    assert.ok(seenByPartner, 'preferred carrier should see the open request');
    assert.equal(seenByPartner.isPreferredPartner, true);

    const externalFeed = await externalCarrier.client.get('/api/requests');
    const seenByExternal = externalFeed.data.requests.find((r) => r.id === request.id);
    assert.ok(seenByExternal, 'external carrier should also see an open request');
    assert.equal(seenByExternal.isPreferredPartner, false);

    // 3. both bid
    const partnerOffer = await partnerCarrier.client.post(`/api/requests/${request.id}/offers`, {
      price: 1450.5,
      message: 'Kann Dienstag laden',
    });
    assert.equal(partnerOffer.status, 201);
    assert.equal(partnerOffer.data.offer.priceCents, 145050);

    const externalOffer = await externalCarrier.client.post(`/api/requests/${request.id}/offers`, {
      price: 1390,
    });
    assert.equal(externalOffer.status, 201);

    // 4. the shipper sees both, partner first
    const offers = await shipper.client.get(`/api/requests/${request.id}/offers`);
    assert.equal(offers.status, 200);
    assert.equal(offers.data.offers.length, 2);
    assert.equal(offers.data.offers[0].carrierCompanyId, partnerCarrier.companyId);
    assert.equal(offers.data.offers[0].isPreferredPartner, true);
    assert.equal(offers.data.offers[0].carrierName, 'Spedition Nord');

    // 5. the shipper accepts the cheaper external offer
    const accepted = await shipper.client.post(`/api/offers/${externalOffer.data.offer.id}/accept`);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.data.request.status, 'assigned');
    assert.equal(accepted.data.request.carrierCompanyId, externalCarrier.companyId);
    assert.equal(accepted.data.request.acceptedPriceCents, 139000);

    // the losing offer is closed, not left dangling
    const afterAccept = await shipper.client.get(`/api/requests/${request.id}/offers`);
    const byId = Object.fromEntries(afterAccept.data.offers.map((o) => [o.id, o.status]));
    assert.equal(byId[externalOffer.data.offer.id], 'accepted');
    assert.equal(byId[partnerOffer.data.offer.id], 'rejected');

    // 6. the winning carrier now has the job in their assigned list
    const assigned = await externalCarrier.client.get('/api/requests?view=assigned');
    assert.equal(assigned.data.requests.length, 1);
    assert.equal(assigned.data.requests[0].id, request.id);
    assert.equal(assigned.data.requests[0].shipperName, 'Werk Süd GmbH');

    // and it is off the open market for everyone else
    const partnerFeedAfter = await partnerCarrier.client.get('/api/requests');
    assert.ok(!partnerFeedAfter.data.requests.some((r) => r.id === request.id));

    // 7. the admin sees the whole picture
    const stats = await admin.client.get('/api/admin/stats');
    assert.equal(stats.status, 200);
    assert.equal(stats.data.stats.requests, 1);
    assert.equal(stats.data.stats.requestsAssigned, 1);
    assert.equal(stats.data.stats.requestsOpen, 0);
    assert.equal(stats.data.stats.brokeredVolumeCents, 139000);
  });

  it('ranks requests from preferred partners above the rest of the market', async () => {
    const strangerShipper = await registerCompany(baseUrl, {
      name: 'Unbekannt GmbH',
      type: 'shipper',
      role: 'shipper',
    });
    const partnerShipper = await registerCompany(baseUrl, {
      name: 'Stammkunde AG',
      type: 'shipper',
      role: 'shipper',
    });
    const carrier = await registerCompany(baseUrl, {
      name: 'Spedition Nord',
      type: 'carrier',
      role: 'carrier',
    });

    await partnerShipper.client.post('/api/partners', { carrierCompanyId: carrier.companyId });

    // The stranger posts first, so creation order alone would put it on top.
    const strangerReq = await strangerShipper.client.post('/api/requests', {
      origin: 'Bremen',
      destination: 'Köln',
      mode: 'road',
      cargo: 'Stückgut',
      pickupDate: futureDate(3),
    });
    const partnerReq = await partnerShipper.client.post('/api/requests', {
      origin: 'Hamburg',
      destination: 'Stuttgart',
      mode: 'road',
      cargo: 'Maschinen',
      pickupDate: futureDate(3),
    });

    const feed = await carrier.client.get('/api/requests');
    const ids = feed.data.requests.map((r) => r.id);
    assert.equal(ids.length, 2);
    assert.equal(ids[0], partnerReq.data.request.id, 'the partner request must come first');
    assert.equal(ids[1], strangerReq.data.request.id);
  });

  it('lets a carrier withdraw a bid and bid again', async () => {
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });
    const carrier = await registerCompany(baseUrl, { name: 'Sped', type: 'carrier', role: 'carrier' });

    const request = (
      await shipper.client.post('/api/requests', {
        origin: 'Hamburg',
        destination: 'Berlin',
        mode: 'road',
        cargo: 'Container',
        pickupDate: futureDate(2),
      })
    ).data.request;

    const first = await carrier.client.post(`/api/requests/${request.id}/offers`, { price: 900 });
    assert.equal(first.status, 201);

    // A second live bid from the same carrier is refused …
    const duplicate = await carrier.client.post(`/api/requests/${request.id}/offers`, { price: 850 });
    assert.equal(duplicate.status, 409);

    // … until the first one is withdrawn.
    assert.equal((await carrier.client.post(`/api/offers/${first.data.offer.id}/withdraw`)).status, 204);
    const second = await carrier.client.post(`/api/requests/${request.id}/offers`, { price: 850 });
    assert.equal(second.status, 201);

    const offers = await shipper.client.get(`/api/requests/${request.id}/offers`);
    const statuses = offers.data.offers.map((o) => o.status).sort();
    assert.deepEqual(statuses, ['pending', 'withdrawn']);
  });

  it('closes pending offers when the shipper cancels the request', async () => {
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });
    const carrier = await registerCompany(baseUrl, { name: 'Sped', type: 'carrier', role: 'carrier' });

    const request = (
      await shipper.client.post('/api/requests', {
        origin: 'Hamburg',
        destination: 'Berlin',
        mode: 'rail',
        cargo: 'Container',
        pickupDate: futureDate(2),
      })
    ).data.request;
    const offer = (await carrier.client.post(`/api/requests/${request.id}/offers`, { price: 700 })).data
      .offer;

    assert.equal((await shipper.client.post(`/api/requests/${request.id}/cancel`)).status, 204);

    const after = await shipper.client.get(`/api/requests/${request.id}`);
    assert.equal(after.data.request.status, 'cancelled');

    const offers = await shipper.client.get(`/api/requests/${request.id}/offers`);
    assert.equal(offers.data.offers.find((o) => o.id === offer.id).status, 'rejected');
  });
});

describe('admin verification', () => {
  it('gates trading until a company is verified', async () => {
    const shipper = await registerCompany(baseUrl, {
      name: 'Frisch Registriert GmbH',
      type: 'shipper',
      role: 'shipper',
      verified: false,
    });
    const admin = await createAdmin(baseUrl);

    const blocked = await shipper.client.post('/api/requests', {
      origin: 'Hamburg',
      destination: 'Berlin',
      mode: 'road',
      cargo: 'Palette',
      pickupDate: futureDate(4),
    });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.data.error.code, 'company_not_verified');

    const pending = await admin.client.get('/api/admin/companies?status=pending');
    assert.ok(pending.data.companies.some((c) => c.id === shipper.companyId));

    const verified = await admin.client.post(
      `/api/admin/companies/${shipper.companyId}/verification`,
      { status: 'verified' }
    );
    assert.equal(verified.status, 200);
    assert.equal(verified.data.company.status, 'verified');

    const allowed = await shipper.client.post('/api/requests', {
      origin: 'Hamburg',
      destination: 'Berlin',
      mode: 'road',
      cargo: 'Palette',
      pickupDate: futureDate(4),
    });
    assert.equal(allowed.status, 201);
  });

  it('signs everyone out when their company is rejected', async () => {
    const carrier = await registerCompany(baseUrl, {
      name: 'Zweifelhaft GmbH',
      type: 'carrier',
      role: 'carrier',
    });
    const admin = await createAdmin(baseUrl);

    assert.equal((await carrier.client.get('/api/auth/me')).status, 200);

    await admin.client.post(`/api/admin/companies/${carrier.companyId}/verification`, {
      status: 'rejected',
    });

    assert.equal((await carrier.client.get('/api/auth/me')).status, 401);
  });
});
