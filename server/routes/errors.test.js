import test from 'node:test';
import assert from 'node:assert/strict';
import { getErrorStatus, ValidationError, sendErrorResponse } from './errors.js';

test('getErrorStatus returns 400 for ValidationError', () => {
  const err = new ValidationError('Invalid username');
  assert.equal(getErrorStatus(err), 400);
});

test('getErrorStatus returns 400 for MongoDB duplicate key code 11000', () => {
  const err = new Error('E11000 duplicate key error');
  err.code = 11000;
  assert.equal(getErrorStatus(err), 400);
});

test('getErrorStatus returns explicit status or statusCode if provided', () => {
  const err404 = new Error('Not found');
  err404.status = 404;
  assert.equal(getErrorStatus(err404), 404);

  const err403 = new Error('Forbidden');
  err403.statusCode = 403;
  assert.equal(getErrorStatus(err403), 403);
});

test('getErrorStatus returns 500 for generic unexpected errors', () => {
  assert.equal(getErrorStatus(new Error('Unexpected disk read error')), 500);
  assert.equal(getErrorStatus(new TypeError('Cannot read property of undefined')), 500);
  assert.equal(getErrorStatus(null), 500);
  assert.equal(getErrorStatus({}), 500);
});

test('sendErrorResponse formats response and suppresses console.error for client errors', (t) => {
  let logged = false;
  const originalError = console.error;
  console.error = () => { logged = true; };
  t.after(() => { console.error = originalError; });

  const clientRes = {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
  };

  sendErrorResponse(clientRes, new ValidationError('Bad field'), 'Fallback', 'Test:');
  assert.equal(clientRes.statusCode, 400);
  assert.deepEqual(clientRes.payload, { error: 'Bad field' });
  assert.equal(logged, false, 'Client validation errors must not log with console.error');

  const serverRes = {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
  };

  sendErrorResponse(serverRes, new Error('Database down'), 'Fallback', 'Test:');
  assert.equal(serverRes.statusCode, 500);
  assert.deepEqual(serverRes.payload, { error: 'Database down' });
  assert.equal(logged, true, 'Server runtime errors must log with console.error');
});
