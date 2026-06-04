import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDailyOvertimeThreshold,
  getScheduleSegments,
  getScheduledNonWorkingStatus,
  getScheduledWorkWindow,
  isScheduledWorkday,
} from './work-schedule.js';

test('getScheduledWorkWindow returns the historical split schedule from the first February workday through before 2026-03-09', () => {
  const schedule = getScheduledWorkWindow('2026-02-02', {
    expectedTimeIn: '08:00',
    expectedTimeOut: '17:00',
  });

  assert.deepEqual(schedule, {
    key: 'split:07:30-11:30-13:00-17:00',
    expectedTimeIn: '07:30',
    expectedTimeOut: '17:00',
    amTimeIn: '07:30',
    amTimeOut: '11:30',
    pmTimeIn: '13:00',
    pmTimeOut: '17:00',
    isSplit: true,
  });
});

test('getScheduleSegments groups mixed month schedules into contiguous ranges', () => {
  const segments = getScheduleSegments('2026-03-01', '2026-03-31', {
    expectedTimeIn: '08:00',
    expectedTimeOut: '17:00',
  });

  assert.deepEqual(segments, [
    {
      startDate: '2026-03-01',
      endDate: '2026-03-08',
      key: 'split:07:30-11:30-13:00-17:00',
      expectedTimeIn: '07:30',
      expectedTimeOut: '17:00',
      amTimeIn: '07:30',
      amTimeOut: '11:30',
      pmTimeIn: '13:00',
      pmTimeOut: '17:00',
      isSplit: true,
    },
    {
      startDate: '2026-03-09',
      endDate: '2026-03-31',
      key: 'single:08:00-17:00',
      expectedTimeIn: '08:00',
      expectedTimeOut: '17:00',
      amTimeIn: '',
      amTimeOut: '',
      pmTimeIn: '',
      pmTimeOut: '',
      isSplit: false,
    },
  ]);
});

test('getScheduleSegments can ignore non-workdays for schedule summaries', () => {
  const segments = getScheduleSegments('2026-02-01', '2026-02-28', {
    expectedTimeIn: '07:00',
    expectedTimeOut: '18:00',
  }, { workdaysOnly: true });

  assert.deepEqual(segments, [
    {
      startDate: '2026-02-02',
      endDate: '2026-02-27',
      key: 'split:07:30-11:30-13:00-17:00',
      expectedTimeIn: '07:30',
      expectedTimeOut: '17:00',
      amTimeIn: '07:30',
      amTimeOut: '11:30',
      pmTimeIn: '13:00',
      pmTimeOut: '17:00',
      isSplit: true,
    },
  ]);
});

test('isScheduledWorkday keeps Monday through Friday before 2026-03-09 and skips Fridays after', () => {
  assert.equal(isScheduledWorkday('2026-02-02'), true);
  assert.equal(isScheduledWorkday('2026-02-06'), true);
  assert.equal(isScheduledWorkday('2026-02-07'), false);
  assert.equal(isScheduledWorkday('2026-03-06'), true);
  assert.equal(isScheduledWorkday('2026-03-13'), false);
  assert.equal(getScheduledNonWorkingStatus('2026-03-13'), 'no_ojt');
});

test('getDailyOvertimeThreshold uses 10 hours from the 4-day workweek start', () => {
  assert.equal(getDailyOvertimeThreshold('2026-03-06'), 8);
  assert.equal(getDailyOvertimeThreshold('2026-03-09'), 10);
  assert.equal(getDailyOvertimeThreshold('2026-05-06'), 10);
});
