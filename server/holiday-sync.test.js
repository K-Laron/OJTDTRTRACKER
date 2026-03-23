import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHolidaySourceBackfillPlan,
  buildHolidaySyncPlan,
  extractPhilippinePublicHolidays,
} from './holiday-sync.js';

test('extractPhilippinePublicHolidays keeps ISO dates and tags public API source', () => {
  const holidays = extractPhilippinePublicHolidays([
    { date: '2026-06-12', localName: 'Araw ng Kalayaan', name: 'Independence Day' },
    { date: 'invalid', localName: 'Skip me', name: 'Skip me' },
    { date: '2026-11-30', name: 'Bonifacio Day' },
  ]);

  assert.deepEqual(holidays, [
    { date: '2026-06-12', name: 'Araw ng Kalayaan', type: 'holiday', source: 'public_api' },
    { date: '2026-11-30', name: 'Bonifacio Day', type: 'holiday', source: 'public_api' },
  ]);
});

test('buildHolidaySyncPlan inserts missing dates but preserves manual records', () => {
  const plan = buildHolidaySyncPlan(
    [
      { date: '2026-06-12', name: 'Manual Holiday', type: 'holiday', source: 'manual' },
      { date: '2026-08-21', name: 'Sick Leave', type: 'sick_leave', source: 'manual' },
    ],
    [
      { date: '2026-06-12', name: 'Araw ng Kalayaan', type: 'holiday', source: 'public_api' },
      { date: '2026-08-21', name: 'Ninoy Aquino Day', type: 'holiday', source: 'public_api' },
      { date: '2026-11-30', name: 'Bonifacio Day', type: 'holiday', source: 'public_api' },
    ]
  );

  assert.deepEqual(plan, {
    toInsert: [
      { date: '2026-11-30', name: 'Bonifacio Day', type: 'holiday', source: 'public_api' },
    ],
    toUpdate: [],
    toDelete: [],
  });
});

test('buildHolidaySyncPlan updates and deletes only managed public API records', () => {
  const plan = buildHolidaySyncPlan(
    [
      { date: '2026-06-12', name: 'Old Name', type: 'holiday', source: 'public_api' },
      { date: '2026-08-21', name: 'Ninoy Aquino Day', type: 'holiday', source: 'public_api' },
      { date: '2026-12-24', name: 'Office Closure', type: 'holiday', source: 'manual' },
    ],
    [
      { date: '2026-06-12', name: 'Araw ng Kalayaan', type: 'holiday', source: 'public_api' },
    ]
  );

  assert.deepEqual(plan, {
    toInsert: [],
    toUpdate: [
      {
        date: '2026-06-12',
        update: { date: '2026-06-12', name: 'Araw ng Kalayaan', type: 'holiday', source: 'public_api' },
      },
    ],
    toDelete: ['2026-08-21'],
  });
});

test('buildHolidaySourceBackfillPlan upgrades only sourceless matching public holidays', () => {
  const dates = buildHolidaySourceBackfillPlan(
    [
      { date: '2026-06-12', name: 'Araw ng Kalayaan', type: 'holiday' },
      { date: '2026-08-21', name: 'Custom Office Holiday', type: 'holiday' },
      { date: '2026-11-30', name: 'Bonifacio Day', type: 'sick_leave' },
      { date: '2026-12-24', name: 'Christmas Eve', type: 'holiday', source: 'manual' },
    ],
    [
      { date: '2026-06-12', name: 'Araw ng Kalayaan', type: 'holiday', source: 'public_api' },
      { date: '2026-08-21', name: 'Ninoy Aquino Day', type: 'holiday', source: 'public_api' },
      { date: '2026-11-30', name: 'Bonifacio Day', type: 'holiday', source: 'public_api' },
    ]
  );

  assert.deepEqual(dates, ['2026-06-12']);
});
