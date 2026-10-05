import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateIndexes } from './migrate-indexes.js';

function stubDb(indexesByCollection) {
  const dropped = [];
  return {
    dropped,
    collection(name) {
      const indexes = indexesByCollection[name];
      if (!indexes) {
        const err = new Error('ns not found');
        err.code = 26;
        throw err;
      }
      return {
        indexes: async () => indexes,
        dropIndex: async (indexName) => {
          dropped.push(`${name}.${indexName}`);
        },
      };
    },
  };
}

test('migrateIndexes drops legacy entries id_1 and non-unique holiday index', async () => {
  const db = stubDb({
    entries: [{ name: 'id_1', unique: true }],
    holidays: [{ name: 'userId_1_date_1', unique: false }],
  });
  await migrateIndexes(db);
  assert.deepEqual(db.dropped, ['entries.id_1', 'holidays.userId_1_date_1']);
});

test('migrateIndexes keeps an already unique holiday index', async () => {
  const db = stubDb({
    entries: [],
    holidays: [{ name: 'userId_1_date_1', unique: true }],
  });
  await migrateIndexes(db);
  assert.deepEqual(db.dropped, []);
});

test('migrateIndexes ignores missing collections', async () => {
  const db = stubDb({});
  await migrateIndexes(db);
  assert.deepEqual(db.dropped, []);
});
