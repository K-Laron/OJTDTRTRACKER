import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDtrEntryHours,
  calculateDtrOvertime,
  formatDtrDayName,
  formatOvertimeDuration,
} from './dtr-rules.js';

test('calculateDtrEntryHours sums complete AM and PM pairs only', () => {
  assert.equal(Number(calculateDtrEntryHours({
    amTimeIn: '08:00',
    amTimeOut: '12:00',
    pmTimeIn: '13:00',
    pmTimeOut: '19:20',
  }).toFixed(2)), 10.33);

  assert.equal(calculateDtrEntryHours({
    amTimeIn: '08:00',
    amTimeOut: '',
    pmTimeIn: '13:00',
    pmTimeOut: '18:00',
  }), 5);
});

test('calculateDtrOvertime uses the date-aware daily threshold', () => {
  assert.equal(calculateDtrOvertime('2026-03-06', 10), 2);
  assert.equal(calculateDtrOvertime('2026-03-09', 10), 0);
  assert.equal(Number(calculateDtrOvertime('2026-03-09', 10.333333333333334).toFixed(2)), 0.33);
});

test('formatOvertimeDuration labels minute and mixed overtime clearly', () => {
  assert.equal(formatOvertimeDuration(0.333333333333334, { blankZero: true }), '20 min');
  assert.equal(formatOvertimeDuration(1.333333333333334, { blankZero: true }), '1 hr 20 min');
  assert.equal(formatOvertimeDuration(2, { blankZero: true }), '2 hrs');
  assert.equal(formatOvertimeDuration(0, { blankZero: true }), '');
});

test('formatDtrDayName returns full weekday names', () => {
  assert.equal(formatDtrDayName('2026-03-09'), 'Monday');
  assert.equal(formatDtrDayName('2026-03-13'), 'Friday');
});
