import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { requireAuth, isAuthTokenExpired } from './require-auth.js';
import { User } from '../models.js';
import { hashAuthToken } from '../services/auth-token.js';

function createMockRes() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

test('requireAuth rejects missing x-user-id header', async () => {
  const req = { headers: { 'x-auth-token': 'token123' } };
  const res = createMockRes();
  let nextCalled = false;

  await requireAuth(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: 'Unauthorized' });
  assert.equal(nextCalled, false);
});

test('requireAuth rejects missing x-auth-token header', async () => {
  const req = { headers: { 'x-user-id': 'user123' } };
  const res = createMockRes();
  let nextCalled = false;

  await requireAuth(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: 'Unauthorized' });
  assert.equal(nextCalled, false);
});

test('requireAuth rejects non-existent user', async () => {
  const findMock = mock.method(User, 'findById', () => ({
    select() { return this; },
    lean: async () => null,
  }));

  const req = { headers: { 'x-user-id': 'missing-user', 'x-auth-token': 'token123' } };
  const res = createMockRes();
  let nextCalled = false;

  try {
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.payload, { error: 'Unauthorized' });
    assert.equal(nextCalled, false);
  } finally {
    findMock.mock.restore();
  }
});

test('requireAuth rejects mismatched auth token', async () => {
  const findMock = mock.method(User, 'findById', (id) => ({
    select() { return this; },
    lean: async () => ({ _id: id, authTokenHash: hashAuthToken('correct-token') }),
  }));

  const req = { headers: { 'x-user-id': 'user123', 'x-auth-token': 'wrong-token' } };
  const res = createMockRes();
  let nextCalled = false;

  try {
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.payload, { error: 'Unauthorized' });
    assert.equal(nextCalled, false);
  } finally {
    findMock.mock.restore();
  }
});

test('requireAuth passes and sets req.userId when token matches', async () => {
  const validToken = 'valid-session-token-999';
  const findMock = mock.method(User, 'findById', (id) => ({
    select() { return this; },
    lean: async () => ({ _id: id, authTokenHash: hashAuthToken(validToken) }),
  }));

  const req = { headers: { 'x-user-id': 'user456', 'x-auth-token': validToken } };
  const res = createMockRes();
  let nextCalled = false;

  try {
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.userId, 'user456');
    assert.equal(res.statusCode, null);
  } finally {
    findMock.mock.restore();
  }
});

test('requireAuth forwards unexpected database errors to next', async () => {
  const dbError = new Error('Database connection failed');
  const findMock = mock.method(User, 'findById', () => ({
    select() { return this; },
    lean: async () => { throw dbError; },
  }));

  const req = { headers: { 'x-user-id': 'user123', 'x-auth-token': 'token123' } };
  const res = createMockRes();
  let caughtError = null;

  try {
    await requireAuth(req, res, (err) => { caughtError = err; });
    assert.equal(caughtError, dbError);
  } finally {
    findMock.mock.restore();
  }
});

test('isAuthTokenExpired detects tokens past the 30-day window', () => {
  const now = Date.now();
  const twentyDaysAgo = new Date(now - 20 * 24 * 60 * 60 * 1000);
  const thirtyOneDaysAgo = new Date(now - 31 * 24 * 60 * 60 * 1000);

  assert.equal(isAuthTokenExpired(twentyDaysAgo, now), false);
  assert.equal(isAuthTokenExpired(thirtyOneDaysAgo, now), true);
  assert.equal(isAuthTokenExpired(null, now), false);
  assert.equal(isAuthTokenExpired('invalid-date', now), false);
});

test('requireAuth rejects expired session tokens with 401 Session expired', async () => {
  const token = 'expired-token-123';
  const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  const findMock = mock.method(User, 'findById', (id) => ({
    select() { return this; },
    lean: async () => ({
      _id: id,
      authTokenHash: hashAuthToken(token),
      authTokenCreatedAt: thirtyOneDaysAgo,
    }),
  }));

  const req = { headers: { 'x-user-id': 'user789', 'x-auth-token': token } };
  const res = createMockRes();
  let nextCalled = false;

  try {
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.payload, { error: 'Session expired' });
    assert.equal(nextCalled, false);
  } finally {
    findMock.mock.restore();
  }
});

test('requireAuth uses targeted field projection on User query', async () => {
  let projectedFields = null;
  const findMock = mock.method(User, 'findById', (id) => ({
    select(fields) {
      projectedFields = fields;
      return this;
    },
    lean: async () => ({
      _id: id,
      authTokenHash: hashAuthToken('test-token'),
      authTokenCreatedAt: new Date(),
    }),
  }));

  const req = { headers: { 'x-user-id': 'user123', 'x-auth-token': 'test-token' } };
  const res = createMockRes();
  let nextCalled = false;

  try {
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(projectedFields, 'authTokenHash authTokenCreatedAt');
  } finally {
    findMock.mock.restore();
  }
});
