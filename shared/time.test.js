import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateHours, parseTimeLenient, parseTimeStrict, toLocalDateString } from './time.js';

test('parseTimeStrict rejects bad format and out of range times', () => {
  assert.equal(parseTimeStrict('08:00'), 480);
  assert.equal(parseTimeStrict('8:00'), null);
  assert.equal(parseTimeStrict('24:00'), null);
  assert.equal(parseTimeStrict(''), null);
});

test('parseTimeLenient keeps legacy client behavior separate from strict', () => {
  assert.equal(parseTimeLenient('8:00'), 480);
  assert.equal(parseTimeLenient(''), null);
});

test('toLocalDateString uses local calendar fields', () => {
  const d = new Date(2026, 3, 6, 12, 0, 0);
  assert.equal(toLocalDateString(d), '2026-04-06');
});

test('calculateHours returns zero for incomplete pairs', () => {
  assert.equal(calculateHours('08:00', ''), 0);
  assert.equal(calculateHours('08:00', '12:00'), 4);
});
