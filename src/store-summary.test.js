import test from 'node:test';
import assert from 'node:assert/strict';

function installBrowserStubs() {
  globalThis.localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
  globalThis.document = {
    body: { className: '' },
    dispatchEvent() {},
  };
  globalThis.window = {
    location: { hash: '' },
    dispatchEvent() {},
  };
  globalThis.Event = class Event {
    constructor(type) {
      this.type = type;
    }
  };
}

test('summary totals count only one present entry per date', async () => {
  installBrowserStubs();
  const { store } = await import('./store.js');

  store.state.entries = [
    {
      id: 'older',
      date: '2026-02-04',
      status: 'present',
      amTimeIn: '07:30',
      amTimeOut: '11:30',
      pmTimeIn: '13:00',
      pmTimeOut: '17:00',
      hoursRendered: 8,
      overtimeHours: 0,
    },
    {
      id: 'newer',
      date: '2026-02-04',
      status: 'present',
      amTimeIn: '07:30',
      amTimeOut: '11:30',
      pmTimeIn: '13:00',
      pmTimeOut: '17:00',
      hoursRendered: 8,
      overtimeHours: 0,
    },
    {
      id: 'next-day',
      date: '2026-02-05',
      status: 'present',
      amTimeIn: '07:30',
      amTimeOut: '11:30',
      pmTimeIn: '13:00',
      pmTimeOut: '17:00',
      hoursRendered: 8,
      overtimeHours: 0,
    },
  ];
  store._markResourcesChanged(['entries']);

  assert.equal(store.getTotalHours(), 16);
  assert.equal(store.getDaysAttended(), 2);
  assert.equal(store.getRemainingHours(), 470);

  store.state.settings.requiredHours = 20;
  const forecast = store.getCompletionForecast('2026-02-05');
  assert.equal(forecast.totalHours, 16);
  assert.equal(forecast.remainingHours, 4);
});
