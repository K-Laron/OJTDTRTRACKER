import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { requireAuth } from './require-auth.js';
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
