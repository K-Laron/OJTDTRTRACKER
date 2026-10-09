import test from 'node:test';
import assert from 'node:assert/strict';

// The model formats times through src/utils.js, which reads store settings, so
// the browser globals have to exist before the module graph is loaded.
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { body: { className: '' }, dispatchEvent() {} };
globalThis.window = { location: { hash: '' }, dispatchEvent() {} };
globalThis.Event = class Event { constructor(type) { this.type = type; } };

const { buildDtrSheetModel } = await import('./dtr-sheet-model.js');

const PRESENT_ENTRY = {
  id: 'entry-1',
  date: '2026-03-06',
  status: 'present',
  amTimeIn: '07:30',
  amTimeOut: '11:30',
  pmTimeIn: '13:00',
  pmTimeOut: '17:00',
  hoursRendered: 8,
  overtimeHours: 0,
  lateMinutes: 0,
  undertimeMinutes: 0,
};

test('one row per calendar day, including days with no record', async () => {
  const sheet = buildDtrSheetModel({
    entries: [PRESENT_ENTRY],
    holidays: [{ date: '2026-03-08', type: 'holiday', name: 'National Holiday' }],
    month: 2,
    year: 2026,
    settings: { expectedTimeIn: '08:00', expectedTimeOut: '17:00' },
  });

  assert.equal(sheet.rows.length, 31);
  assert.equal(sheet.monthLabel, 'March 2026');
  // The month spans both schedule windows, so the summary names each stretch.
  assert.match(sheet.scheduleText, /7:30 AM - 11:30 AM \/ 1:00 PM - 5:00 PM \(Mar 2-Mar 6\)/);
  assert.match(sheet.scheduleText, /8:00 AM - 5:00 PM \(Mar 9-Mar 31\)/);

  const byDate = new Map(sheet.rows.map(row => [row.date, row]));
  assert.equal(byDate.get('2026-03-06').dayName, 'Friday');
  assert.equal(byDate.get('2026-03-06').hoursRendered, 8);
  assert.equal(byDate.get('2026-03-06').isMuted, false);

  // A non-working day with no entry still reports why it is blank.
  const fridayOff = byDate.get('2026-03-13');
  assert.equal(fridayOff.status, 'no_ojt');
  assert.equal(fridayOff.isMuted, true);
  assert.equal(fridayOff.remarks, 'No Ojt');

  const holiday = byDate.get('2026-03-08');
  assert.equal(holiday.activities, 'National Holiday');
  assert.equal(holiday.remarks, 'Holiday');
});

test('overtime is recomputed from the date so a stale stored value cannot print', async () => {
  const sheet = buildDtrSheetModel({
    entries: [{ ...PRESENT_ENTRY, hoursRendered: 9.5, overtimeHours: 0 }],
    holidays: [],
    month: 2,
    year: 2026,
  });

  const row = sheet.rows.find(item => item.date === '2026-03-06');
  // 2026-03-06 predates the four-day week, so the threshold is 8h.
  assert.equal(row.overtimeHours, 1.5);
  assert.equal(sheet.totals.totalOvertime, 1.5);
});

test('a non-present entry contributes no hours and no overtime', async () => {
  const sheet = buildDtrSheetModel({
    entries: [{ ...PRESENT_ENTRY, status: 'leave', hoursRendered: 8 }],
    holidays: [],
    month: 2,
    year: 2026,
  });

  const row = sheet.rows.find(item => item.date === '2026-03-06');
  assert.equal(row.isPresent, false);
  assert.equal(row.hoursRendered, 0);
  assert.equal(row.overtimeHours, 0);
  assert.equal(row.amTimeIn, '');
  assert.equal(sheet.totals.totalHours, 0);
  assert.equal(sheet.totals.daysWorked, 0);
});

test('totals cover only rows with a clock-out, matching what each view prints', async () => {
  const sheet = buildDtrSheetModel({
    entries: [
      PRESENT_ENTRY,
      { ...PRESENT_ENTRY, id: 'entry-2', date: '2026-03-09', amTimeOut: '', pmTimeOut: '', hoursRendered: 4 },
    ],
    holidays: [],
    month: 2,
    year: 2026,
  });

  assert.equal(sheet.totals.totalHours, 8, 'the day with no clock-out prints no hours, so it adds nothing');
  assert.equal(sheet.totals.daysWorked, 1);
});

test('getEntryStatus overrides the fallback status resolver', async () => {
  const sheet = buildDtrSheetModel({
    entries: [{ ...PRESENT_ENTRY, status: undefined, hoursRendered: 8 }],
    holidays: [],
    month: 2,
    year: 2026,
    getEntryStatus: () => 'absent',
  });

  assert.equal(sheet.rows.find(row => row.date === '2026-03-06').isPresent, false);
});