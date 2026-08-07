import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  PASSWORD,
  closePool,
  createClient,
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

describe('registration', () => {
  it('creates a company and its first user, and signs them in', async () => {
    const client = createClient(baseUrl);
    const res = await client.post('/api/auth/register', {
      company: { name: 'Spedition Nord', type: 'carrier', country: 'DE', city: 'Hamburg' },
      user: { name: 'Luis Krahl', email: 'luis@spedition-nord.test', password: PASSWORD, role: 'carrier' },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.user.email, 'luis@spedition-nord.test');
    assert.equal(res.data.user.role, 'carrier');
    assert.equal(res.data.user.company.name, 'Spedition Nord');
    // A new company is not verified yet, and the response says so instead of
    // letting the first request fail with a confusing 403.
    assert.equal(res.data.user.company.status, 'pending');
    assert.match(res.data.notice, /verification/i);
    assert.ok(client.hasSession());

    const me = await client.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, 'luis@spedition-nord.test');
  });

  it('never stores the password in plain text', async () => {
    const client = createClient(baseUrl);
    await client.post('/api/auth/register', {
      company: { name: 'Cargo Co', type: 'shipper' },
      user: { name: 'Ann', email: 'ann@cargo.test', password: PASSWORD, role: 'shipper' },
    });

    const { rows } = await query('SELECT password_hash FROM users WHERE email = $1', ['ann@cargo.test']);
    assert.ok(!rows[0].password_hash.includes(PASSWORD));
    assert.match(rows[0].password_hash, /^scrypt\$\d+\$\d+\$\d+\$/);
  });

  it('rejects a duplicate email regardless of casing', async () => {
    const client = createClient(baseUrl);
    const payload = {
      company: { name: 'Cargo Co', type: 'shipper' },
      user: { name: 'Ann', email: 'ann@cargo.test', password: PASSWORD, role: 'shipper' },
    };
    assert.equal((await client.post('/api/auth/register', payload)).status, 201);

    const second = await createClient(baseUrl).post('/api/auth/register', {
      ...payload,
      user: { ...payload.user, email: 'ANN@Cargo.TEST' },
    });
    assert.equal(second.status, 409);
    assert.equal(second.data.error.code, 'conflict');
  });

  it('rejects a short password', async () => {
    const res = await createClient(baseUrl).post('/api/auth/register', {
      company: { name: 'Cargo Co', type: 'shipper' },
      user: { name: 'Ann', email: 'short@cargo.test', password: 'short', role: 'shipper' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.error.code, 'validation_failed');
  });

  it('rejects an owner role the company type cannot have', async () => {
    const res = await createClient(baseUrl).post('/api/auth/register', {
      company: { name: 'Only Ships', type: 'shipper' },
      user: { name: 'Ann', email: 'mismatch@cargo.test', password: PASSWORD, role: 'carrier' },
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error.message, /cannot have a carrier account/i);
  });

  it('does not let anyone register themselves as an admin', async () => {
    const res = await createClient(baseUrl).post('/api/auth/register', {
      company: { name: 'Sneaky', type: 'shipper' },
      user: { name: 'Mallory', email: 'mallory@x.test', password: PASSWORD, role: 'admin' },
    });
    assert.equal(res.status, 400);
  });
});

describe('login', () => {
  it('signs in with the right password and rejects the wrong one', async () => {
    const { email } = await registerCompany(baseUrl, {
      name: 'Nordfracht',
      type: 'carrier',
      role: 'carrier',
    });

    const bad = await createClient(baseUrl).post('/api/auth/login', {
      email,
      password: 'definitely-wrong-password',
    });
    assert.equal(bad.status, 401);

    const good = await createClient(baseUrl).post('/api/auth/login', { email, password: PASSWORD });
    assert.equal(good.status, 200);
    assert.equal(good.data.user.email, email);
  });

  it('gives the same answer for an unknown email as for a wrong password', async () => {
    const { email } = await registerCompany(baseUrl, {
      name: 'Nordfracht',
      type: 'carrier',
      role: 'carrier',
    });

    const wrongPassword = await createClient(baseUrl).post('/api/auth/login', {
      email,
      password: 'definitely-wrong-password',
    });
    const unknownEmail = await createClient(baseUrl).post('/api/auth/login', {
      email: 'nobody@nowhere.test',
      password: 'definitely-wrong-password',
    });

    // Otherwise login doubles as a way to find out who has an account.
    assert.equal(wrongPassword.status, unknownEmail.status);
    assert.deepEqual(wrongPassword.data, unknownEmail.data);
  });

  it('refuses a disabled account', async () => {
    const { email, userId } = await registerCompany(baseUrl, {
      name: 'Nordfracht',
      type: 'carrier',
      role: 'carrier',
    });
    await query(`UPDATE users SET status = 'disabled' WHERE id = $1`, [userId]);

    const res = await createClient(baseUrl).post('/api/auth/login', { email, password: PASSWORD });
    assert.equal(res.status, 401);
  });

  it('throttles repeated failures for the same account', async () => {
    const { email } = await registerCompany(baseUrl, {
      name: 'Nordfracht',
      type: 'carrier',
      role: 'carrier',
    });
    const client = createClient(baseUrl);

    let sawRateLimit = false;
    for (let i = 0; i < 15; i += 1) {
      const res = await client.post('/api/auth/login', { email, password: `wrong-${i}` });
      if (res.status === 429) {
        sawRateLimit = true;
        break;
      }
    }
    assert.ok(sawRateLimit, 'expected a 429 after repeated failed logins');
  });
});

describe('sessions', () => {
  it('stores only a hash of the session token', async () => {
    const { client } = await registerCompany(baseUrl, {
      name: 'Nordfracht',
      type: 'carrier',
      role: 'carrier',
    });
    await client.get('/api/auth/me');

    const { rows } = await query('SELECT token_hash FROM sessions');
    assert.equal(rows.length, 1);
    // 64 hex characters, i.e. SHA-256 — not the token itself.
    assert.match(rows[0].token_hash, /^[a-f0-9]{64}$/);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await createClient(baseUrl).get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  it('invalidates the session on logout', async () => {
    const { client } = await registerCompany(baseUrl, {
      name: 'Nordfracht',
      type: 'carrier',
      role: 'carrier',
    });

    assert.equal((await client.post('/api/auth/logout')).status, 204);
    assert.equal((await client.get('/api/auth/me')).status, 401);
    assert.equal((await query('SELECT 1 FROM sessions')).rowCount, 0);
  });

  it('signs other devices out when the password changes', async () => {
    const { client, email } = await registerCompany(baseUrl, {
      name: 'Nordfracht',
      type: 'carrier',
      role: 'carrier',
    });

    const otherDevice = createClient(baseUrl);
    await otherDevice.post('/api/auth/login', { email, password: PASSWORD });
    assert.equal((await otherDevice.get('/api/auth/me')).status, 200);

    const changed = await client.post('/api/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'a-brand-new-passphrase',
    });
    assert.equal(changed.status, 204);

    // The other device is logged out; the one that changed it stays in.
    assert.equal((await otherDevice.get('/api/auth/me')).status, 401);
    assert.equal((await client.get('/api/auth/me')).status, 200);
  });

  it('rejects a password change with the wrong current password', async () => {
    const { client } = await registerCompany(baseUrl, {
      name: 'Nordfracht',
      type: 'carrier',
      role: 'carrier',
    });
    const res = await client.post('/api/auth/password', {
      currentPassword: 'not-the-current-one',
      newPassword: 'a-brand-new-passphrase',
    });
    assert.equal(res.status, 401);
  });
});
