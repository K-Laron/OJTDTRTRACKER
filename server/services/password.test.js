import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, isHashedPassword, verifyPassword } from './password.js';

test('hashPassword roundtrips and rejects wrong passwords', async () => {
  const hash = await hashPassword('secret-123');
  assert.equal(isHashedPassword(hash), true);
  assert.equal(await verifyPassword('secret-123', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

test('legacy plain-text passwords are detected as unhashed', () => {
  assert.equal(isHashedPassword('plainpassword'), false);
  assert.equal(isHashedPassword(''), false);
  assert.equal(isHashedPassword(null), false);
});

test('verifyPassword returns false for unhashed stored values', async () => {
  assert.equal(await verifyPassword('plainpassword', 'plainpassword'), false);
});
