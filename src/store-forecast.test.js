import test from 'node:test';
import assert from 'node:assert/strict';

function installBrowserStubs() {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.document = { body: { className: '' }, dispatchEvent() {} };
  globalThis.window = { location: { hash: '' }, dispatchEvent() {} };
  globalThis.Event = class Event { constructor(type) { this.type = type; } };
}

const workedDay = (date, hoursRendered) => ({
  id: date,
  date,
  status: 'present',
  amTimeIn: '08:00',
  amTimeOut: '17:00',
  hoursRendered,
});

test('store forecast returns shared scenario, confidence and suggestion fields', async () => {
  installBrowserStubs();
  const { store } = await import('./store.js');

  store.state.settings.requiredHours = 200;
  store.state.entries = [
    workedDay('2026-03-30', 8),
    workedDay('2026-03-31', 8),
    workedDay('2026-04-01', 8),
    workedDay('2026-04-02', 8),
    workedDay('2026-04-03', 8),
  ];
  store.state.holidays = [{ date: '2026-04-07', type: 'holiday' }];
  store._markResourcesChanged(['entries', 'holidays', 'config']);

  const forecast = store.getCompletionForecast('2026-04-06');

  assert.equal(forecast.totalHours, 40);
  assert.equal(forecast.remainingHours, 160);
  assert.equal(forecast.confidence, 'high');
  assert.deepEqual(Object.keys(forecast.scenarios), ['conservative', 'expected', 'optimistic']);
  // 160h at 8h/day is 20 workdays; the 2026-04-07 holiday is skipped and recorded.
  assert.equal(forecast.scenarios.expected.workingDaysRemaining, 20);
  assert.deepEqual(forecast.excludedDates, [{ date: '2026-04-07', status: 'holiday' }]);
  assert.ok(forecast.suggestions.length > 0);
});