import test from 'node:test';
import assert from 'node:assert/strict';

function installBrowserStubs() {
  globalThis.localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
  globalThis.document = {
    createElement: () => ({
      className: '',
      textContent: '',
      classList: { add() {}, remove() {} },
      remove() {},
    }),
    body: { appendChild() {}, className: '' },
    dispatchEvent() {},
  };
  globalThis.requestAnimationFrame = fn => fn();
  globalThis.setTimeout = () => 0;
}

test('DTR sheet model builds full day rows with date-aware overtime labels', async () => {
  installBrowserStubs();
  const { buildDtrSheetModel } = await import('./dtr-sheet-model.js');

  const model = buildDtrSheetModel({
    entries: [{
      date: '2026-03-09',
      status: 'present',
      amTimeIn: '07:00',
      amTimeOut: '12:00',
      pmTimeIn: '13:00',
      pmTimeOut: '18:20',
      hoursRendered: 10.3333333333,
      activities: 'Encoded records',
      remarks: 'Reviewed',
    }],
    holidays: [],
    month: 2,
    year: 2026,
    profile: { name: 'Kenneth Laron' },
    settings: { expectedTimeIn: '08:00', expectedTimeOut: '17:00' },
  });

  const row = model.rows[8];
  assert.equal(row.date, '2026-03-09');
  assert.equal(row.dayName, 'Monday');
  assert.equal(row.overtimeDisplay, '20 min');
  assert.equal(Object.hasOwn(row, 'activities'), false);
  assert.equal(model.totals.totalOvertimeDisplay, '20 min');
});

test('DTR sheet model suppresses work time for non-working rows', async () => {
  installBrowserStubs();
  const { buildDtrSheetModel } = await import('./dtr-sheet-model.js');

  const model = buildDtrSheetModel({
    entries: [],
    holidays: [{ date: '2026-01-01', type: 'holiday', name: 'New Year' }],
    month: 0,
    year: 2026,
    settings: { expectedTimeIn: '08:00', expectedTimeOut: '17:00' },
  });

  assert.equal(model.rows[0].dayName, 'Thursday');
  assert.equal(model.rows[0].remarks, 'Holiday - New Year');
  assert.equal(model.rows[0].hoursDisplay, '');
  assert.equal(model.rows[0].overtimeDisplay, '');
});
