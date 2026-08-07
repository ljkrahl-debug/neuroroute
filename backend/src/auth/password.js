import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// scrypt from Node's standard library. CLAUDE.md suggests a hosted auth
// provider, but sessions live in our own Postgres instead — see
// src/auth/sessions.js for why. That leaves password hashing to us, and the
// right move there is a vetted KDF with sane parameters, not anything clever.
//
// N=2^15, r=8, p=1 is the widely used interactive-login profile: ~32 MB and
// ~100 ms per hash on normal server hardware. The parameters are written into
// every stored hash, so they can be raised later without invalidating existing
// passwords — verify reads the parameters from the hash it is checking.
const PARAMS = { N: 32768, r: 8, p: 1, keylen: 32 };
const MAXMEM = 128 * PARAMS.N * PARAMS.r * 2; // scrypt needs 128*N*r, doubled for headroom

export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const salt = randomBytes(16);
  const derived = await scryptAsync(password.normalize('NFKC'), salt, PARAMS.keylen, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: MAXMEM,
  });
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  let derived;
  try {
    derived = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    });
  } catch {
    return false;
  }

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// A login attempt for an address that does not exist must take about as long
// as one for an address that does, otherwise response time reveals which
// emails are registered.
const DUMMY_HASH_PROMISE = hashPassword('not-a-real-password-placeholder');

export async function fakeVerify() {
  await verifyPassword('wrong-password-attempt', await DUMMY_HASH_PROMISE);
  return false;
}
