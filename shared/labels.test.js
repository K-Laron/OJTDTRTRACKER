import test from 'node:test';
import assert from 'node:assert/strict';
import { MONTHS, formatHolidayTypeLabel } from './labels.js';

test('MONTHS covers the full year in order', () => {
  assert.equal(MONTHS.length, 12);
  assert.equal(MONTHS[0], 'January');
  assert.equal(MONTHS[11], 'December');
});

test('formatHolidayTypeLabel humanizes leave types', () => {
  assert.equal(formatHolidayTypeLabel('holiday'), 'Holiday');
  assert.equal(formatHolidayTypeLabel('sick_leave'), 'Sick Leave');
  assert.equal(formatHolidayTypeLabel('vacation_leave'), 'Vacation Leave');
  assert.equal(formatHolidayTypeLabel(''), '');
  assert.equal(formatHolidayTypeLabel(null), '');
});
