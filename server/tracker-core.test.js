import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImportPreview,
  calculateCompletionForecast,
  DEFAULT_SETTINGS,
  entriesConflict,
  resolveEntryUpdate,
  sanitizeEntry,
  sanitizeHoliday,
  sanitizeImportPayload,
} from './tracker-core.js';

test('sanitizeEntry recalculates derived fields from raw times', () => {
  const entry = sanitizeEntry({
    id: 'entry-1',
    date: '2026-03-21',
    status: 'present',
    amTimeIn: '08:30',
    amTimeOut: '12:00',
    pmTimeIn: '13:00',
    pmTimeOut: '17:30',
    hoursRendered: 999,
    overtimeHours: 999,
    lateMinutes: 999,
    undertimeMinutes: 999,
  }, DEFAULT_SETTINGS);

  assert.equal(entry.hoursRendered, 8);
  assert.equal(entry.overtimeHours, 0);
  assert.equal(entry.lateMinutes, 30);
  assert.equal(entry.undertimeMinutes, 0);
});

test('sanitizeEntry merges partial updates with the existing entry', () => {
  const existing = {
    id: 'entry-2',
    date: '2026-03-21',
    status: 'present',
    amTimeIn: '08:00',
    amTimeOut: '12:00',
    pmTimeIn: '13:00',
    pmTimeOut: '',
    remarks: '',
    activities: '',
    createdAt: '2026-03-21T00:00:00.000Z',
  };

  const updated = sanitizeEntry({
    pmTimeOut: '18:00',
  }, DEFAULT_SETTINGS, { existingEntry: existing });

  assert.equal(updated.hoursRendered, 9);
  assert.equal(updated.overtimeHours, 1);
  assert.equal(updated.pmTimeIn, '13:00');
  assert.equal(updated.pmTimeOut, '18:00');
});

test('sanitizeImportPayload rejects duplicate ids and duplicate holiday dates', () => {
  assert.throws(() => {
    sanitizeImportPayload({
      entries: [
        { id: 'dup', date: '2026-03-21', amTimeIn: '08:00', amTimeOut: '12:00' },
        { id: 'dup', date: '2026-03-22', amTimeIn: '08:00', amTimeOut: '12:00' },
      ],
    });
  }, /Duplicate entry id/);

  assert.throws(() => {
    sanitizeImportPayload({
      holidays: [
        { date: '2026-03-21', name: 'Holiday', type: 'holiday' },
        { date: '2026-03-21', name: 'Leave', type: 'vacation_leave' },
      ],
    });
  }, /Duplicate holiday date/);
});

test('sanitizeHoliday defaults manual source and accepts public API source', () => {
  assert.deepEqual(
    sanitizeHoliday({ date: '2026-06-12', name: 'Araw ng Kalayaan', type: 'holiday' }),
    { date: '2026-06-12', name: 'Araw ng Kalayaan', type: 'holiday', source: 'manual' }
  );

  assert.deepEqual(
    sanitizeHoliday({ date: '2026-06-12', name: 'Araw ng Kalayaan', type: 'holiday', source: 'public_api' }),
    { date: '2026-06-12', name: 'Araw ng Kalayaan', type: 'holiday', source: 'public_api' }
  );
});

test('sanitizeImportPayload recalculates imported entries using imported settings', () => {
  const payload = sanitizeImportPayload({
    settings: {
      expectedTimeIn: '09:00',
      expectedTimeOut: '18:00',
    },
    entries: [
      {
        id: 'entry-3',
        date: '2026-03-21',
        status: 'present',
        amTimeIn: '09:15',
        amTimeOut: '12:00',
        pmTimeIn: '13:00',
        pmTimeOut: '18:00',
      },
    ],
  });

  assert.equal(payload.entries[0].lateMinutes, 15);
  assert.equal(payload.entries[0].undertimeMinutes, 0);
  assert.equal(payload.settings.expectedTimeIn, '09:00');
});

test('entriesConflict only flags meaningful user-facing changes', () => {
  const current = {
    id: 'entry-4',
    date: '2026-03-21',
    status: 'present',
    amTimeIn: '08:00',
    amTimeOut: '12:00',
    pmTimeIn: '13:00',
    pmTimeOut: '17:00',
    remarks: 'done',
    activities: 'coding',
    hoursRendered: 8,
  };

  assert.equal(entriesConflict(current, { ...current, hoursRendered: 99 }), false);
  assert.equal(entriesConflict(current, { ...current, remarks: 'changed' }), true);
});

test('resolveEntryUpdate auto-merges non-overlapping stale changes', () => {
  const previous = {
    id: 'entry-merge',
    date: '2026-03-21',
    status: 'present',
    amTimeIn: '08:00',
    amTimeOut: '12:00',
    pmTimeIn: '13:00',
    pmTimeOut: '17:00',
    remarks: '',
    activities: 'coding',
    createdAt: '2026-03-21T00:00:00.000Z',
  };
  const current = {
    ...previous,
    remarks: 'server note',
  };

  const result = resolveEntryUpdate(current, previous, { activities: 'documentation' }, DEFAULT_SETTINGS);

  assert.equal(result.type, 'merged');
  assert.deepEqual(result.clientChangedFields, ['activities']);
  assert.deepEqual(result.serverChangedFields, ['remarks']);
  assert.equal(result.entry.remarks, 'server note');
  assert.equal(result.entry.activities, 'documentation');
});

test('resolveEntryUpdate reports overlapping stale edits as conflicts', () => {
  const previous = {
    id: 'entry-conflict',
    date: '2026-03-21',
    status: 'present',
    amTimeIn: '08:00',
    amTimeOut: '12:00',
    pmTimeIn: '13:00',
    pmTimeOut: '17:00',
    remarks: '',
    activities: 'coding',
    createdAt: '2026-03-21T00:00:00.000Z',
  };
  const current = {
    ...previous,
    remarks: 'server note',
  };

  const result = resolveEntryUpdate(current, previous, { remarks: 'client note' }, DEFAULT_SETTINGS);

  assert.equal(result.type, 'conflict');
  assert.deepEqual(result.conflictingFields, ['remarks']);
});

test('buildImportPreview reports added, changed, and removed items', () => {
  const preview = buildImportPreview(
    sanitizeImportPayload({
      profile: { name: 'New Name' },
      settings: { expectedTimeIn: '09:00' },
      theme: 'light',
      entries: [
        { id: 'keep', date: '2026-03-21', status: 'present', amTimeIn: '08:30', amTimeOut: '12:00' },
        { id: 'new', date: '2026-03-22', status: 'present', amTimeIn: '08:00', amTimeOut: '12:00' },
      ],
      holidays: [
        { date: '2026-03-25', name: 'Holiday', type: 'holiday', source: 'manual' },
      ],
    }),
    {
      profile: { name: 'Old Name' },
      settings: { expectedTimeIn: '08:00' },
      theme: 'dark',
      entries: [
        { id: 'keep', date: '2026-03-21', status: 'present', amTimeIn: '08:00', amTimeOut: '12:00' },
        { id: 'remove', date: '2026-03-23', status: 'present', amTimeIn: '08:00', amTimeOut: '12:00' },
      ],
      holidays: [
        { date: '2026-03-26', name: 'Old Holiday', type: 'holiday', source: 'manual' },
      ],
    }
  );

  assert.equal(preview.diff.entriesAdded, 1);
  assert.equal(preview.diff.entriesChanged, 1);
  assert.equal(preview.diff.entriesRemoved, 1);
  assert.equal(preview.diff.holidaysAdded, 1);
  assert.equal(preview.diff.holidaysRemoved, 1);
  assert.equal(preview.diff.themeChanged, true);
  assert.deepEqual(preview.diff.changedProfileFields, ['name']);
  assert.ok(preview.diff.changedSettingFields.includes('expectedTimeIn'));
});

test('sanitizeEntry preserves present status and derived totals', () => {
  const entry = sanitizeEntry({
    id: 'entry-status-present',
    date: '2026-04-01',
    status: 'present',
    amTimeIn: '08:00',
    amTimeOut: '12:00',
    pmTimeIn: '13:00',
    pmTimeOut: '17:00',
  }, DEFAULT_SETTINGS);

  assert.equal(entry.status, 'present');
  assert.equal(entry.hoursRendered, 8);
  assert.equal(entry.lateMinutes, 0);
});

test('sanitizeEntry zeroes time fields and hours for non-present statuses', () => {
  const entry = sanitizeEntry({
    id: 'entry-status-leave',
    date: '2026-04-02',
    status: 'leave',
    amTimeIn: '08:00',
    amTimeOut: '12:00',
    pmTimeIn: '13:00',
    pmTimeOut: '17:00',
    remarks: 'approved leave',
  }, DEFAULT_SETTINGS);

  assert.equal(entry.status, 'leave');
  assert.equal(entry.amTimeIn, '');
  assert.equal(entry.pmTimeOut, '');
  assert.equal(entry.hoursRendered, 0);
});

test('sanitizeImportPayload preserves non-present statuses without requiring time fields', () => {
  const payload = sanitizeImportPayload({
    entries: [
      {
        id: 'entry-vacation',
        date: '2026-04-03',
        status: 'vacation',
        remarks: 'approved trip',
      },
    ],
  });

  assert.equal(payload.entries[0].status, 'vacation');
  assert.equal(payload.entries[0].hoursRendered, 0);
});

test('calculateCompletionForecast skips non-working future statuses', () => {
  const forecast = calculateCompletionForecast({
    today: '2026-04-06',
    requiredHours: 40,
    entries: [
      { date: '2026-04-01', status: 'present', hoursRendered: 8 },
      { date: '2026-04-02', status: 'present', hoursRendered: 8 },
      { date: '2026-04-03', status: 'present', hoursRendered: 8 },
      { date: '2026-04-07', status: 'leave', hoursRendered: 0 },
      { date: '2026-04-08', status: 'vacation', hoursRendered: 0 },
      { date: '2026-04-09', status: 'no_ojt', hoursRendered: 0 },
      { date: '2026-04-10', status: 'holiday', hoursRendered: 0 },
    ],
  });

  assert.equal(forecast.avgPerDay, 8);
  assert.equal(forecast.remainingHours, 16);
  assert.equal(forecast.workingDaysRemaining, 2);
  assert.equal(forecast.estimatedDate, '2026-04-14');
  assert.deepEqual(
    forecast.excludedDates.map(item => item.status),
    ['leave', 'vacation', 'no_ojt']
  );
});

test('calculateCompletionForecast skips Fridays after the four-day workweek starts on 2026-03-09', () => {
  const forecast = calculateCompletionForecast({
    today: '2026-03-12',
    requiredHours: 40,
    entries: [
      { date: '2026-03-09', status: 'present', hoursRendered: 8 },
      { date: '2026-03-10', status: 'present', hoursRendered: 8 },
      { date: '2026-03-11', status: 'present', hoursRendered: 8 },
      { date: '2026-03-12', status: 'present', hoursRendered: 8 },
    ],
  });

  assert.equal(forecast.avgPerDay, 8);
  assert.equal(forecast.remainingHours, 8);
  assert.equal(forecast.workingDaysRemaining, 1);
  assert.equal(forecast.estimatedDate, '2026-03-16');
});
