import test from 'node:test';
import assert from 'node:assert/strict';
import { findPreviousWorkingEntry, batchUpdateStatuses } from './store-batch.js';

test('findPreviousWorkingEntry returns closest prior present entry with activities', () => {
  const store = {
    getAllEntriesWithDerivedStatus: () => [
      { date: '2026-03-05', status: 'present', activities: 'Recent work' },
      { date: '2026-03-03', status: 'present', activities: 'Prior work' },
      { date: '2026-03-02', status: 'leave', activities: '' },
    ],
  };

  const found = findPreviousWorkingEntry(store, '2026-03-04');
  assert.equal(found?.date, '2026-03-03');
  assert.equal(found?.activities, 'Prior work');
});

test('batchUpdateStatuses adds missing dates and updates existing ones', async () => {
  const added = [];
  const updated = [];
  const store = {
    getEntryStatus: (e) => e.status || 'present',
    getEntryByDate: (date) => (date === '2026-03-01' ? { id: 'e1', date, status: 'absent' } : null),
    addEntry: async (e) => { added.push(e); },
    updateEntry: async (id, e) => { updated.push({ id, ...e }); },
  };

  await batchUpdateStatuses(store, ['2026-03-01', '2026-03-02'], 'present');
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, 'e1');
  assert.equal(updated[0].status, 'present');
  assert.equal(added.length, 1);
  assert.equal(added[0].date, '2026-03-02');
  assert.equal(added[0].status, 'present');
});
