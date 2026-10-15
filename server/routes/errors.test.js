import test from 'node:test';
import assert from 'node:assert/strict';
import { getErrorStatus, ValidationError } from './errors.js';

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
