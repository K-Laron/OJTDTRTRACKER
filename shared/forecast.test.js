import test from 'node:test';
import assert from 'node:assert/strict';
import { countWorkingDays } from './forecast.js';

const MON_FRI = (date) => {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day !== 0 && day !== 6;
};

test('countWorkingDays skips weekends without recording them', () => {
  // Friday 2026-04-03, needs 1 day -> Monday 2026-04-06
  const result = countWorkingDays({
    startDate: '2026-04-03',
    daysNeeded: 1,
    statusByDate: new Map(),
    isWorkday: MON_FRI,
    isExcluded: () => false,
  });
  assert.equal(result.estimatedDate, '2026-04-06');
  assert.deepEqual(result.excludedDates, []);
});

test('countWorkingDays records excluded dates and keeps counting', () => {
  const result = countWorkingDays({
    startDate: '2026-04-06',
    daysNeeded: 2,
    statusByDate: new Map([['2026-04-07', 'leave']]),
    isWorkday: MON_FRI,
    isExcluded: (status) => status === 'leave',
  });
  assert.equal(result.estimatedDate, '2026-04-09');
  assert.deepEqual(result.excludedDates, [{ date: '2026-04-07', status: 'leave' }]);
});
