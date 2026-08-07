// Test harness. Imported first by every test file, because it sets the
// environment before src/config.js is evaluated.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://postgres@127.0.0.1:5432/neuroroute_test';
process.env.CORS_ORIGINS ??= 'http://localhost:5173';

const { createApp } = await import('../src/app.js');
const { query, closePool } = await import('../src/db.js');

export { query, closePool };

/** Boots the API on an ephemeral port and returns its base URL. */
export async function startServer() {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/** Empties every table but keeps the schema, so tests start from a clean slate. */
export async function resetDb() {
  await query(`
    TRUNCATE marketplace_listings, capacity, offers, transport_requests,
             partners, sessions, users, companies RESTART IDENTITY CASCADE
  `);
}

/**
 * A fetch wrapper that remembers the session cookie, so each client behaves
 * like one signed-in browser.
 */
export function createClient(baseUrl) {
  let cookie = null;

  async function request(method, path, payload) {
    const headers = {};
    if (payload !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });

    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      if (pair.startsWith('nr_session=')) {
        cookie = pair.endsWith('=') ? null : pair;
      }
    }

    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { status: res.status, data };
  }

  return {
    get: (path) => request('GET', path),
    post: (path, payload) => request('POST', path, payload),
    patch: (path, payload) => request('PATCH', path, payload),
    del: (path) => request('DELETE', path),
    hasSession: () => cookie !== null,
    clearCookie: () => {
      cookie = null;
    },
  };
}

let counter = 0;
function uniqueEmail(prefix) {
  counter += 1;
  return `${prefix}${counter}.${Date.now()}@example.test`;
}

const PASSWORD = 'correct-horse-battery';

/**
 * Registers a company with its first user and signs that user in.
 * Companies are verified by default, because most tests are about what happens
 * after verification; pass verified:false to exercise the gate itself.
 */
export async function registerCompany(baseUrl, { name, type, role, verified = true } = {}) {
  const client = createClient(baseUrl);
  const email = uniqueEmail(role ?? 'user');

  const res = await client.post('/api/auth/register', {
    company: { name, type, country: 'DE' },
    user: { name: `${name} Owner`, email, password: PASSWORD, role },
  });
  if (res.status !== 201) {
    throw new Error(`register failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  const companyId = res.data.user.company.id;
  if (verified) {
    await query(`UPDATE companies SET status = 'verified' WHERE id = $1`, [companyId]);
  }

  return { client, email, password: PASSWORD, userId: res.data.user.id, companyId };
}

/** Creates a platform admin directly and signs in as them. */
export async function createAdmin(baseUrl) {
  const { hashPassword } = await import('../src/auth/password.js');
  const email = uniqueEmail('admin');
  const hash = await hashPassword(PASSWORD);
  await query(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Platform Admin', 'admin')`,
    [email, hash]
  );

  const client = createClient(baseUrl);
  const res = await client.post('/api/auth/login', { email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`admin login failed: ${JSON.stringify(res.data)}`);
  return { client, email, password: PASSWORD };
}

export function futureDate(daysFromNow = 7) {
  const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export { PASSWORD };
