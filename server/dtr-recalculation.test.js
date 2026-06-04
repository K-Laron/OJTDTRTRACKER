import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEntryRecalculationPlan, getEntryRecalculationChange } from './dtr-recalculation.js';
import { DEFAULT_SETTINGS } from './tracker-core.js';

test('getEntryRecalculationChange reports stale derived entry fields only', () => {
  const change = getEntryRecalculationChange({
    id: 'entry-stale',
    userId: 'user-1',
    date: '2026-03-09',
    status: 'present',
    amTimeIn: '07:00',
    amTimeOut: '12:00',
    pmTimeIn: '13:00',
    pmTimeOut: '18:20',
    hoursRendered: 10.3333333333,
    overtimeHours: 2.3333333333,
    lateMinutes: 0,
    undertimeMinutes: 0,
    activities: 'Done',
  }, DEFAULT_SETTINGS);

  assert.deepEqual(change.before, { overtimeHours: 2.3333333333 });
  assert.ok(Math.abs(change.after.overtimeHours - (1 / 3)) < 0.000001);
  assert.equal(change.backup.activities, 'Done');
});

test('buildEntryRecalculationPlan applies user-specific settings', () => {
  const settingsByUserId = new Map([
    ['user-1', { ...DEFAULT_SETTINGS, expectedTimeIn: '09:00', expectedTimeOut: '18:00' }],
  ]);

  const plan = buildEntryRecalculationPlan([{
    id: 'entry-late',
    userId: 'user-1',
    date: '2026-03-09',
    status: 'present',
    amTimeIn: '09:15',
    amTimeOut: '12:00',
    pmTimeIn: '13:00',
    pmTimeOut: '18:00',
    hoursRendered: 7.75,
    overtimeHours: 0,
    lateMinutes: 0,
    undertimeMinutes: 0,
  }], settingsByUserId);

  assert.equal(plan.scanned, 1);
  assert.equal(plan.changed, 1);
  assert.deepEqual(plan.changes[0].after, { lateMinutes: 15 });
});
