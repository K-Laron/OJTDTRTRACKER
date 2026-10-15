import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const {
  DEFAULT_ACTIVITY_TEMPLATES,
  getActivityTemplates,
  saveActivityTemplate,
  deleteActivityTemplate,
} = await import('./activity-templates.js');

test('getActivityTemplates returns defaults when storage is empty', () => {
  storage.clear();
  const templates = getActivityTemplates();
  assert.equal(templates.length, DEFAULT_ACTIVITY_TEMPLATES.length);
  assert.equal(templates[0].id, 'template-documentation');
});

test('saveActivityTemplate saves and unshifts new template', () => {
  storage.clear();
  const saved = saveActivityTemplate({
    id: 'test-custom',
    name: 'Custom Task',
    activities: 'Worked on custom feature',
    remarks: 'Approved',
  });
  assert.equal(saved[0].id, 'test-custom');
  assert.equal(saved[0].name, 'Custom Task');
});

test('deleteActivityTemplate removes template by id', () => {
  const updated = deleteActivityTemplate('test-custom');
  assert.equal(updated.some(t => t.id === 'test-custom'), false);
});
