import test from 'node:test';
import assert from 'node:assert/strict';

function installBrowserStubs() {
  globalThis.localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
}

test('formatOvertimeDuration labels minute-based overtime clearly', async () => {
  installBrowserStubs();
  const { formatOvertimeDuration } = await import('./utils.js');

  assert.equal(formatOvertimeDuration(0.5, { blankZero: true }), '30 min');
  assert.equal(formatOvertimeDuration(1.5, { blankZero: true }), '1 hr 30 min');
  assert.equal(formatOvertimeDuration(2, { blankZero: true }), '2 hrs');
  assert.equal(formatOvertimeDuration(0, { blankZero: true }), '');
  assert.equal(formatOvertimeDuration(0), '0 min');
});
