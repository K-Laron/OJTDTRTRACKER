import test from 'node:test';
import assert from 'node:assert/strict';
import { signOffMonth, retractMonthSignOff, getMonthSignOff } from './store-signoff.js';

test('store-signoff can sign off, retrieve, and retract month approvals', async () => {
  let saved = false;
  const store = {
    state: {
      profile: { supervisor: 'Dr. Jane Smith' },
      signOffs: {},
    },
    async _saveConfig() {
      saved = true;
    },
  };

  assert.equal(getMonthSignOff(store, '2026-10'), null);

  await signOffMonth(store, '2026-10', 'Dr. Jane Smith', 'All hours verified');
  assert.equal(saved, true);

  const signOff = getMonthSignOff(store, '2026-10');
  assert.notEqual(signOff, null);
  assert.equal(signOff.supervisor, 'Dr. Jane Smith');
  assert.equal(signOff.remarks, 'All hours verified');
  assert.ok(signOff.signedAt);

  saved = false;
  await retractMonthSignOff(store, '2026-10');
  assert.equal(saved, true);
  assert.equal(getMonthSignOff(store, '2026-10'), null);
});
