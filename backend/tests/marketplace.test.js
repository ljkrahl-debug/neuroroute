import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { closePool, futureDate, query, registerCompany, resetDb, startServer } from './helpers.js';

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

async function carrier(name = 'Spedition Nord') {
  return registerCompany(baseUrl, { name, type: 'carrier', role: 'carrier' });
}

describe('capacity planning', () => {
  it('records planned legs and reports whether they are on the marketplace', async () => {
    const sped = await carrier();

    const created = await sped.client.post('/api/capacity', {
      origin: 'Hamburg',
      destination: 'München',
      mode: 'road',
      departDate: futureDate(4),
      capacityDesc: 'Sattelzug 24t',
      utilizationPct: 95,
      recurring: true,
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.capacity.utilizationPct, 95);

    const list = await sped.client.get('/api/capacity');
    assert.equal(list.data.capacity.length, 1);
    assert.equal(list.data.capacity[0].listingId, null);
  });

  it('does not let a shipper touch capacity planning', async () => {
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });
    const res = await shipper.client.post('/api/capacity', {
      origin: 'A',
      destination: 'B',
      mode: 'road',
      departDate: futureDate(2),
    });
    assert.equal(res.status, 403);
  });
});

describe('empty run detection', () => {
  it('spots a loaded leg whose return is not planned', async () => {
    const sped = await carrier();

    // Hamburg → München loaded, nothing coming back: the CLAUDE.md case.
    await sped.client.post('/api/capacity', {
      origin: 'Hamburg',
      destination: 'München',
      mode: 'road',
      departDate: futureDate(4),
      utilizationPct: 95,
    });

    const res = await sped.client.get('/api/capacity/suggestions');
    assert.equal(res.status, 200);

    const uncovered = res.data.suggestions.filter((s) => s.type === 'uncovered_return');
    assert.equal(uncovered.length, 1);
    // The suggestion is ready to post back: the return leg, prefilled.
    assert.equal(uncovered[0].createCapacity.origin, 'München');
    assert.equal(uncovered[0].createCapacity.destination, 'Hamburg');
    assert.equal(uncovered[0].createCapacity.returnEmpty, true);
    assert.match(uncovered[0].reason, /running empty/i);
  });

  it('stays quiet when the return leg is already planned', async () => {
    const sped = await carrier();

    await sped.client.post('/api/capacity', {
      origin: 'Hamburg',
      destination: 'München',
      mode: 'road',
      departDate: futureDate(4),
      utilizationPct: 95,
    });
    await sped.client.post('/api/capacity', {
      origin: 'München',
      destination: 'Hamburg',
      mode: 'road',
      departDate: futureDate(5),
      utilizationPct: 80,
    });

    const res = await sped.client.get('/api/capacity/suggestions');
    const uncovered = res.data.suggestions.filter((s) => s.type === 'uncovered_return');
    // The Hamburg leg is covered. The München leg has no return within the
    // window, so exactly one suggestion is expected, not zero.
    assert.equal(uncovered.length, 1);
    assert.equal(uncovered[0].createCapacity.origin, 'Hamburg');
  });

  it('suggests publishing a leg that is flagged as running empty', async () => {
    const sped = await carrier();

    const leg = await sped.client.post('/api/capacity', {
      origin: 'München',
      destination: 'Hamburg',
      mode: 'road',
      departDate: futureDate(5),
      returnEmpty: true,
      utilizationPct: 0,
    });

    const res = await sped.client.get('/api/capacity/suggestions');
    const flagged = res.data.suggestions.filter((s) => s.type === 'flagged_empty');
    assert.equal(flagged.length, 1);
    assert.equal(flagged[0].capacityId, leg.data.capacity.id);
    assert.equal(flagged[0].publish.origin, 'München');

    // Once it is published the suggestion disappears.
    await sped.client.post(`/api/capacity/${leg.data.capacity.id}/publish`, {
      price: 680,
      listPrice: 1100,
    });
    const after = await sped.client.get('/api/capacity/suggestions');
    assert.equal(after.data.suggestions.filter((s) => s.type === 'flagged_empty').length, 0);
  });

  it('only ever looks at the carrier’s own legs', async () => {
    const a = await carrier('Sped A');
    const b = await carrier('Sped B');

    await a.client.post('/api/capacity', {
      origin: 'Hamburg',
      destination: 'München',
      mode: 'road',
      departDate: futureDate(4),
    });

    const res = await b.client.get('/api/capacity/suggestions');
    assert.equal(res.data.suggestions.length, 0);
  });
});

describe('the marketplace', () => {
  it('publishes a planned leg in one call and shows the discount', async () => {
    const sped = await carrier();
    const leg = (
      await sped.client.post('/api/capacity', {
        origin: 'München',
        destination: 'Hamburg',
        mode: 'road',
        departDate: futureDate(5),
        capacityDesc: 'Sattelzug 24t frei',
        returnEmpty: true,
      })
    ).data.capacity;

    const published = await sped.client.post(`/api/capacity/${leg.id}/publish`, {
      price: 680,
      listPrice: 1100,
    });
    assert.equal(published.status, 201);

    const listing = published.data.listing;
    assert.equal(listing.priceCents, 68000);
    assert.equal(listing.listPriceCents, 110000);
    // 1 - 680/1100 = 38.2 % -> 38
    assert.equal(listing.discountPct, 38);
    // the route came from the capacity entry, the carrier only named a price
    assert.equal(listing.origin, 'München');
    assert.equal(listing.destination, 'Hamburg');
    assert.equal(listing.detail, 'Sattelzug 24t frei');
    assert.equal(listing.capacityId, leg.id);

    const planner = await sped.client.get('/api/capacity');
    assert.equal(planner.data.capacity[0].listingId, listing.id);
  });

  it('refuses to publish the same leg twice', async () => {
    const sped = await carrier();
    const leg = (
      await sped.client.post('/api/capacity', {
        origin: 'München',
        destination: 'Hamburg',
        mode: 'road',
        departDate: futureDate(5),
      })
    ).data.capacity;

    assert.equal((await sped.client.post(`/api/capacity/${leg.id}/publish`, { price: 680 })).status, 201);
    const again = await sped.client.post(`/api/capacity/${leg.id}/publish`, { price: 600 });
    assert.equal(again.status, 409);
  });

  it('refuses to publish someone else’s capacity', async () => {
    const a = await carrier('Sped A');
    const b = await carrier('Sped B');
    const leg = (
      await a.client.post('/api/capacity', {
        origin: 'Bremen',
        destination: 'Köln',
        mode: 'road',
        departDate: futureDate(3),
      })
    ).data.capacity;

    assert.equal((await b.client.post(`/api/capacity/${leg.id}/publish`, { price: 500 })).status, 403);
  });

  it('rejects a normal price below the offered price', async () => {
    const sped = await carrier();
    const res = await sped.client.post('/api/marketplace', {
      origin: 'A',
      destination: 'B',
      mode: 'road',
      price: 900,
      listPrice: 500,
    });
    assert.equal(res.status, 400);
  });

  it('lets a shipper find and book discounted capacity', async () => {
    const sped = await carrier();
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });

    await sped.client.post('/api/marketplace', {
      origin: 'München',
      destination: 'Hamburg',
      mode: 'road',
      detail: 'Leerfahrt Rückweg',
      price: 680,
      listPrice: 1100,
      availableFrom: futureDate(5),
      availableTo: futureDate(5),
    });

    const found = await shipper.client.get('/api/marketplace?destination=Hamburg&mode=road');
    assert.equal(found.status, 200);
    assert.equal(found.data.listings.length, 1);
    assert.equal(found.data.listings[0].companyName, 'Spedition Nord');
    assert.equal(found.data.listings[0].discountPct, 38);

    const booked = await shipper.client.post(`/api/marketplace/${found.data.listings[0].id}/book`);
    assert.equal(booked.status, 200);
    assert.equal(booked.data.listing.status, 'booked');

    // booked capacity leaves the open marketplace
    const afterBooking = await shipper.client.get('/api/marketplace');
    assert.equal(afterBooking.data.listings.length, 0);

    const { rows } = await query(
      'SELECT booked_by_company_id, booked_at FROM marketplace_listings LIMIT 1'
    );
    assert.equal(rows[0].booked_by_company_id, shipper.companyId);
    assert.ok(rows[0].booked_at);
  });

  it('gives the capacity to exactly one of two simultaneous buyers', async () => {
    const sped = await carrier();
    const buyerA = await registerCompany(baseUrl, { name: 'Werk A', type: 'shipper', role: 'shipper' });
    const buyerB = await registerCompany(baseUrl, { name: 'Werk B', type: 'shipper', role: 'shipper' });

    const listing = (
      await sped.client.post('/api/marketplace', {
        origin: 'München',
        destination: 'Hamburg',
        mode: 'road',
        price: 680,
      })
    ).data.listing;

    const [resA, resB] = await Promise.all([
      buyerA.client.post(`/api/marketplace/${listing.id}/book`),
      buyerB.client.post(`/api/marketplace/${listing.id}/book`),
    ]);

    assert.deepEqual([resA.status, resB.status].sort(), [200, 409]);

    const { rows } = await query(
      `SELECT count(*)::int AS booked FROM marketplace_listings WHERE status = 'booked'`
    );
    assert.equal(rows[0].booked, 1);
  });

  it('does not let a company book its own capacity', async () => {
    const sped = await carrier();
    const listing = (
      await sped.client.post('/api/marketplace', {
        origin: 'A',
        destination: 'B',
        mode: 'road',
        price: 500,
      })
    ).data.listing;

    const res = await sped.client.post(`/api/marketplace/${listing.id}/book`);
    assert.equal(res.status, 400);
  });

  it('does not let a stranger withdraw a listing, and keeps booked ones', async () => {
    const sped = await carrier('Sped A');
    const other = await carrier('Sped B');
    const shipper = await registerCompany(baseUrl, { name: 'Werk', type: 'shipper', role: 'shipper' });

    const listing = (
      await sped.client.post('/api/marketplace', {
        origin: 'A',
        destination: 'B',
        mode: 'road',
        price: 500,
      })
    ).data.listing;

    assert.equal((await other.client.del(`/api/marketplace/${listing.id}`)).status, 403);
    assert.equal((await shipper.client.post(`/api/marketplace/${listing.id}/book`)).status, 200);
    // a booked leg is a commitment, not something to quietly pull back
    assert.equal((await sped.client.del(`/api/marketplace/${listing.id}`)).status, 409);
  });

  it('keeps an unverified company out of the marketplace', async () => {
    const newcomer = await registerCompany(baseUrl, {
      name: 'Neuling',
      type: 'carrier',
      role: 'carrier',
      verified: false,
    });

    const res = await newcomer.client.get('/api/marketplace');
    assert.equal(res.status, 403);
    assert.equal(res.data.error.code, 'company_not_verified');
  });
});
