import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseEntriesByDate, upsertEntryForDate } from './entries.js';

const entry = (id, date, createdAt) => ({ id, date, createdAt });

test('collapseEntriesByDate keeps the newest entry for a repeated date', () => {
  const collapsed = collapseEntriesByDate([
    entry('older', '2026-02-04', '2026-02-04T08:00:00.000Z'),
    entry('newer', '2026-02-04', '2026-02-04T09:00:00.000Z'),
    entry('other', '2026-02-05', '2026-02-05T08:00:00.000Z'),
  ]);

  assert.deepEqual(collapsed.map(item => item.id), ['newer', 'other']);
});

test('collapseEntriesByDate falls back to array order when timestamps are missing', () => {
  const collapsed = collapseEntriesByDate([
    entry('first', '2026-02-04'),
    entry('second', '2026-02-04'),
  ]);

  assert.deepEqual(collapsed.map(item => item.id), ['second']);
});

test('collapseEntriesByDate drops rows with no date', () => {
  const collapsed = collapseEntriesByDate([{ id: 'orphan' }, entry('kept', '2026-02-04')]);

  assert.deepEqual(collapsed.map(item => item.id), ['kept']);
});

test('upsertEntryForDate replaces every row on the same date', () => {
  const result = upsertEntryForDate([
    entry('first', '2026-02-04'),
    entry('second', '2026-02-04'),
    entry('other', '2026-02-05'),
  ], entry('replacement', '2026-02-04'));

  assert.deepEqual(result.map(item => item.id), ['other', 'replacement']);
});

test('upsertEntryForDate appends when the date is new and clears when entry is empty', () => {
  const withNew = upsertEntryForDate([entry('a', '2026-02-04')], entry('b', '2026-02-05'));
  assert.deepEqual(withNew.map(item => item.id), ['a', 'b']);

  const without = upsertEntryForDate(withNew, null);
  assert.deepEqual(without.map(item => item.id), ['a', 'b']);
});