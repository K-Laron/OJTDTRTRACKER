import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;

export function createAuthToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashAuthToken(token) {
  return createHash('sha256').update(String(token || '')).digest('base64url');
}

export function verifyAuthToken(storedHash, token) {
  if (!storedHash || !token) return false;
  const expected = Buffer.from(String(storedHash));
  const actual = Buffer.from(hashAuthToken(token));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
