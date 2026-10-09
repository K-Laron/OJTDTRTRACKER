import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEntryRecalculationPlan, getEntryRecalculationChange } from './dtr-recalculation.service.js';
import { DEFAULT_SETTINGS } from '../tracker-core.js';

test('getEntryRecalculationChange reports only the fields that would change', () => {
  const change = getEntryRecalculationChange({
    _id: 'mongo-id',
    id: 'entry-1',
    userId: 'user-1',
    date: '2026-03-06',
    status: 'present',
    amTimeIn: '07:30',
    amTimeOut: '11:30',
    pmTimeIn: '13:00',
    pmTimeOut: '17:00',
    hoursRendered: 99,
    overtimeHours: 99,
    lateMinutes: 99,
    undertimeMinutes: 99,
    remarks: 'keep me',
  }, DEFAULT_SETTINGS);

  assert.deepEqual(change.before, {
    hoursRendered: 99,
    overtimeHours: 99,
    lateMinutes: 99,
    undertimeMinutes: 99,
  });
  assert.deepEqual(change.after, {
    hoursRendered: 8,
    overtimeHours: 0,
    lateMinutes: 0,
    undertimeMinutes: 0,
  });
  assert.equal(change.backup.remarks, 'keep me');
  assert.equal(change.backup._id, undefined, 'mongo ids are not part of the backup');
});

test('getEntryRecalculationChange returns null when nothing would change', () => {
  const change = getEntryRecalculationChange({
    id: 'entry-2',
    userId: 'user-1',
    date: '2026-03-06',
    status: 'present',
    amTimeIn: '07:30',
    amTimeOut: '11:30',
    pmTimeIn: '13:00',
    pmTimeOut: '17:00',
    hoursRendered: 8,
    overtimeHours: 0,
    lateMinutes: 0,
    undertimeMinutes: 0,
  }, DEFAULT_SETTINGS);

  assert.equal(change, null);
});

test('buildEntryRecalculationPlan picks the settings for each row owner', () => {
  const row = (id, userId, overtimeHours) => ({
    id,
    userId,
    date: '2026-04-06',
    status: 'present',
    amTimeIn: '08:00',
    amTimeOut: '12:00',
    hoursRendered: 4,
    overtimeHours,
    lateMinutes: 0,
    undertimeMinutes: 0,
  });

  const plan = buildEntryRecalculationPlan(
    [row('a', 'user-1', 4), row('b', 'user-2', 4), row('c', 'user-3', 0)],
    new Map([
      ['user-1', { ...DEFAULT_SETTINGS, expectedTimeIn: '09:00' }],
      ['user-2', { ...DEFAULT_SETTINGS, expectedTimeIn: '07:00' }],
    ]),
  );

  assert.equal(plan.scanned, 3);
  assert.equal(plan.changed, 2, 'row c is already correct under the default settings');
  assert.deepEqual(plan.changes.map(change => change.id), ['a', 'b']);
  // `after` carries only the fields that move, so an unchanged late figure is absent.
  assert.deepEqual(plan.changes[0].after, { overtimeHours: 0 }, 'user-1 expects 09:00, so 08:00 is on time');
  assert.deepEqual(plan.changes[1].after, { overtimeHours: 0, lateMinutes: 60 }, 'user-2 expects 07:00');
});

test('a row missing a derived field is reported as needing recalculation', () => {
  const plan = buildEntryRecalculationPlan([{
    id: 'd',
    userId: 'user-1',
    date: '2026-04-06',
    status: 'present',
    amTimeIn: '08:00',
    amTimeOut: '12:00',
    hoursRendered: 4,
    overtimeHours: 0,
  }]);

  assert.equal(plan.changed, 1);
  assert.deepEqual(plan.changes[0].after.lateMinutes, 0);
  assert.equal(plan.changes[0].before.lateMinutes, 0);
});