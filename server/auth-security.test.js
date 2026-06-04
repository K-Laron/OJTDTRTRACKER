import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAuthToken,
  hashAuthToken,
  hashPassword,
  isPasswordHash,
  normalizeUsername,
  validateAuthInput,
  verifyPassword,
} from './auth-security.js';

test('password hashes verify and do not store plaintext', async () => {
  const hash = await hashPassword('correct-password');

  assert.equal(isPasswordHash(hash), true);
  assert.notEqual(hash, 'correct-password');
  assert.equal(await verifyPassword('correct-password', hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
});

test('legacy plaintext passwords can be verified for migration', async () => {
  assert.equal(await verifyPassword('old-password', 'old-password'), true);
  assert.equal(await verifyPassword('wrong-password', 'old-password'), false);
});

test('auth token hashes are stable but do not expose the token', () => {
  const token = createAuthToken();
  const hash = hashAuthToken(token);

  assert.equal(token.length > 30, true);
  assert.equal(hashAuthToken(token), hash);
  assert.notEqual(hash, token);
});

test('auth input is normalized and validated', () => {
  assert.equal(normalizeUsername(' Kenneth_Laron '), 'kenneth_laron');
  assert.deepEqual(validateAuthInput({ username: 'Kenneth-01', password: 'password123' }), {
    username: 'kenneth-01',
    password: 'password123',
  });
  assert.throws(() => validateAuthInput({ username: 'ab', password: 'password123' }), /Username/);
  assert.throws(() => validateAuthInput({ username: 'kenneth', password: 'short' }), /Password/);
});
