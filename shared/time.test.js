import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEntryHours,
  calculateHours,
  calculateLate,
  calculateUndertime,
  parseTimeLenient,
  parseTimeStrict,
  toLocalDateString,
} from './time.js';

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

test('calculateLate computes minutes after expected time in', () => {
  assert.equal(calculateLate('08:15', '08:00'), 15);
  assert.equal(calculateLate('08:00', '08:00'), 0);
  assert.equal(calculateLate('07:45', '08:00'), 0);
  assert.equal(calculateLate('', '08:00'), 0);
});

test('calculateUndertime computes minutes before expected time out', () => {
  assert.equal(calculateUndertime('16:45', '17:00'), 15);
  assert.equal(calculateUndertime('17:00', '17:00'), 0);
  assert.equal(calculateUndertime('17:30', '17:00'), 0);
  assert.equal(calculateUndertime('', '17:00'), 0);
});

test('calculateEntryHours sums AM and PM windows', () => {
  assert.equal(
    calculateEntryHours({
      amTimeIn: '08:00',
      amTimeOut: '12:00',
      pmTimeIn: '13:00',
      pmTimeOut: '17:00',
    }),
    8,
  );
  assert.equal(
    calculateEntryHours({
      amTimeIn: '08:00',
      amTimeOut: '12:00',
    }),
    4,
  );
  assert.equal(calculateEntryHours({}), 0);
});
