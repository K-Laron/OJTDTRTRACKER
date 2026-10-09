import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { body: { className: '' }, dispatchEvent() {} };
globalThis.window = { location: { hash: '' }, dispatchEvent() {} };
globalThis.Event = class Event { constructor(type) { this.type = type; } };

const { store } = await import('./store.js');

const worked = (id, date, createdAt, hoursRendered = 8) => ({
  id,
  date,
  status: 'present',
  amTimeIn: '08:00',
  amTimeOut: '12:00',
  pmTimeIn: '13:00',
  pmTimeOut: '17:00',
  hoursRendered,
  overtimeHours: 0,
  lateMinutes: 0,
  undertimeMinutes: 0,
  createdAt,
});

test('every reader counts one entry per date after server state lands', () => {
  store.state.settings.requiredHours = 486;
  store._applyServerState([
    worked('older', '2026-02-04', '2026-02-04T08:00:00.000Z'),
    worked('newer', '2026-02-04', '2026-02-04T09:00:00.000Z'),
    worked('next', '2026-02-05', '2026-02-05T08:00:00.000Z'),
  ], [], null, ['entries']);

  assert.equal(store.state.entries.length, 2, 'the older duplicate is dropped at the write boundary');
  assert.equal(store.getTotalHours(), 16);
  assert.equal(store.getDaysAttended(), 2);
  assert.equal(store.getStatusSummary(2026, 1).present, 2, 'the status summary must not double count');
  assert.equal(store.getCurrentWeekHours() >= 0, true);
  assert.equal(store.getSummaryPack({ dateFrom: '2026-02-01', dateTo: '2026-02-28' }).statuses.present, 2);
  assert.equal(store.getMonthlyTrendData()['2026-02'].days, 2);
});

test('the forecast sees the same single entry per date', () => {
  store.state.settings.requiredHours = 100;
  store._applyServerState([
    worked('a', '2026-02-04', '2026-02-04T08:00:00.000Z'),
    worked('b', '2026-02-04', '2026-02-04T09:00:00.000Z'),
  ], [], null, ['entries']);

  const forecast = store.getCompletionForecast('2026-02-05');
  assert.equal(forecast.totalHours, 8);
  assert.equal(forecast.remainingHours, 92);
});