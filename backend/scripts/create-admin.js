#!/usr/bin/env node
/**
 * Create a platform admin. Admins are deliberately not creatable through the
 * API, so this is the only way one comes into existence.
 *
 *   node scripts/create-admin.js "Name" admin@example.com
 *
 * The password is read from the ADMIN_PASSWORD environment variable, or
 * generated and printed once if that is not set. It is never passed as an
 * argument, because arguments show up in shell history and in `ps`.
 */
import { randomBytes } from 'node:crypto';

import { hashPassword, MIN_PASSWORD_LENGTH } from '../src/auth/password.js';
import { closePool, query } from '../src/db.js';

const [name, email] = process.argv.slice(2);

if (!name || !email) {
  console.error('Usage: node scripts/create-admin.js "Full Name" email@example.com');
  process.exit(1);
}

const normalisedEmail = email.trim().toLowerCase();
if (!normalisedEmail.includes('@')) {
  console.error(`"${email}" does not look like an email address`);
  process.exit(1);
}

let password = process.env.ADMIN_PASSWORD;
let generated = false;
if (!password) {
  password = randomBytes(18).toString('base64url');
  generated = true;
} else if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
  process.exit(1);
}

try {
  const existing = await query('SELECT id FROM users WHERE email = $1', [normalisedEmail]);
  if (existing.rowCount > 0) {
    console.error(`A user with ${normalisedEmail} already exists`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin')
     RETURNING id, email, name, role`,
    [normalisedEmail, passwordHash, name]
  );

  console.log(`Created admin ${rows[0].name} <${rows[0].email}>`);
  if (generated) {
    console.log(`Password (shown once, store it now): ${password}`);
  }
} finally {
  await closePool();
}
