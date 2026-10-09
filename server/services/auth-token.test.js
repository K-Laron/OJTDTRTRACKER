import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthToken, hashAuthToken, verifyAuthToken } from './auth-token.js';
import { normalizeUsername, validateAuthInput } from './auth.service.js';

test('auth tokens verify only against their own hash', () => {
  const token = createAuthToken();
  const hash = hashAuthToken(token);

  assert.notEqual(token, hash);
  assert.equal(verifyAuthToken(hash, token), true);
  assert.equal(verifyAuthToken(hash, createAuthToken()), false);
  assert.equal(verifyAuthToken('', token), false);
  assert.equal(verifyAuthToken(hash, ''), false);
});

test('normalizeUsername lowercases and trims', () => {
  assert.equal(normalizeUsername('  Kenneth.Awani  '), 'kenneth.awani');
  assert.equal(normalizeUsername(undefined), '');
});

test('validateAuthInput enforces the registration password policy', () => {
  assert.throws(() => validateAuthInput({ username: 'kenneth', password: 'short' }), /Password must be 8 to 128/);
  assert.throws(() => validateAuthInput({ username: 'ab', password: 'longenough1' }), /Username must be 3 to 64/);
  assert.throws(() => validateAuthInput({ username: 'bad name', password: 'longenough1' }), /can only use/);
  assert.throws(() => validateAuthInput({ username: '', password: '' }), /required/);

  assert.deepEqual(
    validateAuthInput({ username: '  Kenneth.Awani ', password: 'longenough1' }),
    { username: 'kenneth.awani', password: 'longenough1' },
  );
});

test('validateAuthInput lets login accept stored legacy passwords', () => {
  const legacy = validateAuthInput(
    { username: 'kenneth', password: 'old' },
    { enforcePasswordPolicy: false },
  );
  assert.equal(legacy.password, 'old');

  assert.throws(
    () => validateAuthInput({ username: 'kenneth', password: 'x'.repeat(129) }, { enforcePasswordPolicy: false }),
    /128 characters or fewer/,
  );
});