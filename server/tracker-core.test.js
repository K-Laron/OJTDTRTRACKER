import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImportPreview,
  DEFAULT_SETTINGS,
  entriesConflict,
  resolveEntryUpdate,
  sanitizeEntry,
  sanitizeImportPayload,
} from './tracker-core.js';

test('sanitizeEntry recalculates derived fields from raw times', () => {
  const entry = sanitizeEntry({
    id: 'entry-1',
    date: '2026-03-21',
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
        { id: 'keep', date: '2026-03-21', amTimeIn: '08:30', amTimeOut: '12:00' },
        { id: 'new', date: '2026-03-22', amTimeIn: '08:00', amTimeOut: '12:00' },
      ],
      holidays: [
        { date: '2026-03-25', name: 'Holiday', type: 'holiday' },
      ],
    }),
    {
      profile: { name: 'Old Name' },
      settings: { expectedTimeIn: '08:00' },
      theme: 'dark',
      entries: [
        { id: 'keep', date: '2026-03-21', amTimeIn: '08:00', amTimeOut: '12:00' },
        { id: 'remove', date: '2026-03-23', amTimeIn: '08:00', amTimeOut: '12:00' },
      ],
      holidays: [
        { date: '2026-03-26', name: 'Old Holiday', type: 'holiday' },
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
