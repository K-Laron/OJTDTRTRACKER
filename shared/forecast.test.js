import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompletionForecast } from './forecast.js';

const MON_FRI = (date) => {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day !== 0 && day !== 6;
};
const resolveStatus = (entry) => entry?.status || 'absent';
const noExclusions = () => false;
const excludeLeave = (status) => status === 'leave' || status === 'vacation' || status === 'holiday';

function forecast(overrides = {}) {
  return buildCompletionForecast({
    today: '2026-04-06',
    requiredHours: 24,
    entries: [
      { date: '2026-04-01', status: 'present', amTimeIn: '08:00', amTimeOut: '17:00', hoursRendered: 8 },
    ],
    resolveStatus,
    isWorkday: MON_FRI,
    isExcluded: noExclusions,
    ...overrides,
  });
}

test('scenario projection skips weekends without recording them', () => {
  // Friday 2026-04-03, 8h remaining at 8h/day -> Monday 2026-04-06
  const result = forecast({ today: '2026-04-03', requiredHours: 16 });
  assert.equal(result.scenarios.expected.estimatedDate, '2026-04-06');
  assert.deepEqual(result.scenarios.expected.excludedDates, []);
});

test('scenario projection records excluded dates and keeps counting', () => {
  const result = forecast({
    today: '2026-04-06',
    requiredHours: 32,
    holidays: [
      { date: '2026-04-07', type: 'vacation_leave' },
      { date: '2026-04-10', type: 'holiday' },
    ],
    isExcluded: excludeLeave,
  });
  // 24h left over 2 workdays: 2026-04-07 vacation, 2026-04-08, 2026-04-09, holiday 2026-04-10
  assert.equal(result.scenarios.expected.estimatedDate, '2026-04-13');
  assert.deepEqual(
    result.scenarios.expected.excludedDates.map(item => `${item.date}:${item.status}`),
    ['2026-04-07:vacation', '2026-04-10:holiday'],
  );
});

test('entries without a complete clock pair count toward totals but not toward the pace average', () => {
  const result = forecast({
    requiredHours: 60,
    entries: [
      { date: '2026-04-01', status: 'present', amTimeIn: '08:00', amTimeOut: '17:00', hoursRendered: 8 },
      { date: '2026-04-02', status: 'present', amTimeIn: '08:00', amTimeOut: '17:00', hoursRendered: 8 },
      { date: '2026-04-03', status: 'present', amTimeIn: '08:00', amTimeOut: '17:00', hoursRendered: 8 },
      { date: '2026-04-04', status: 'present', amTimeIn: '08:00', hoursRendered: 8 },
    ],
  });
  assert.equal(result.totalHours, 32);
  assert.equal(result.completeTotalHours, 24);
  assert.equal(result.lifetimeAvgPerDay, 8);
  assert.equal(result.confidence, 'medium');
  assert.ok(result.confidenceReasons.some(reason => reason.includes('incomplete clock pairs')));
});

test('no complete worked day yields null', () => {
  assert.equal(forecast({
    entries: [{ date: '2026-04-01', status: 'absent', hoursRendered: 0 }],
  }), null);
});

test('completed required hours returns every scenario at today', () => {
  const result = forecast({ requiredHours: 8 });
  assert.equal(result.remainingHours, 0);
  assert.deepEqual(Object.keys(result.scenarios), ['conservative', 'expected', 'optimistic']);
  Object.values(result.scenarios).forEach(scenario => {
    assert.equal(scenario.workingDaysRemaining, 0);
    assert.equal(scenario.estimatedDate, '2026-04-06');
  });
  assert.ok(result.suggestions.includes('Required OJT hours are complete.'));
});

test('a near-zero pace is bounded instead of walking the calendar forever', () => {
  const result = forecast({
    entries: [
      { date: '2026-04-01', status: 'present', amTimeIn: '08:00', amTimeOut: '08:01', hoursRendered: 0.0166 },
    ],
    requiredHours: 400,
  });
  // The scan is capped at three years of calendar days from today, so a
  // degenerate pace returns a bounded date instead of spinning forever.
  assert.ok(result.scenarios.expected.estimatedDate > '2028-04-06');
  assert.ok(result.scenarios.expected.estimatedDate < '2030-01-01');
});