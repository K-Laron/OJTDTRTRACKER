import test from 'node:test';
import assert from 'node:assert/strict';
import { clearAuthFailures, isAuthLimited, recordAuthFailure } from './auth-throttle.js';

const req = (ip) => ({ ip, socket: { remoteAddress: ip } });

test('failed attempts accumulate per client and username', () => {
  const request = req('10.0.0.9');
  const username = 'throttle-case';

  for (let attempt = 0; attempt < 7; attempt += 1) {
    assert.equal(isAuthLimited(request, username), false);
    recordAuthFailure(request, username);
  }
  assert.equal(isAuthLimited(request, username), false);
  recordAuthFailure(request, username);
  assert.equal(isAuthLimited(request, username), true);

  // A different client or username is tracked separately.
  assert.equal(isAuthLimited(req('10.0.0.10'), username), false);
  assert.equal(isAuthLimited(request, 'someone-else'), false);

  clearAuthFailures(request, username);
  assert.equal(isAuthLimited(request, username), false);
});

test('usernames are tracked case-insensitively', () => {
  const request = req('10.0.0.11');
  recordAuthFailure(request, 'MixedCase');
  assert.equal(isAuthLimited(request, 'mixedcase'), false);
  recordAuthFailure(request, 'mixedcase');
  assert.equal(isAuthLimited(request, 'MIXEDCASE'), false);
  recordAuthFailure(request, 'MIXEDCASE');
  clearAuthFailures(request, 'mixedcase');
});