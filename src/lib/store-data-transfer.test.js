import test from 'node:test';
import assert from 'node:assert/strict';
import { exportData, previewImport } from './store-data-transfer.js';

test('exportData serializes current store state to formatted JSON', () => {
  const store = { state: { entries: [{ id: '1', date: '2026-03-01' }], holidays: [] } };
  const json = exportData(store);
  const parsed = JSON.parse(json);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].id, '1');
});

test('previewImport posts data to import preview endpoint', async () => {
  let requestedPath = null;
  let requestedBody = null;
  const store = {
    getAuthHeaders: (h) => ({ 'X-User-Id': 'u1', ...h }),
    _request: async (path, options) => {
      requestedPath = path;
      requestedBody = JSON.parse(options.body);
      return { added: 1 };
    },
  };

  const res = await previewImport(store, JSON.stringify({ entries: [{ id: '1' }] }));
  assert.equal(requestedPath, '/import/preview');
  assert.equal(requestedBody.entries.length, 1);
  assert.equal(res.added, 1);
});
