import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOvertimeForDate,
  getDailyOvertimeThreshold,
  getScheduleSegments,
  getScheduledNonWorkingStatus,
  getScheduledWorkWindow,
  isFourDayWorkweekFriday,
  isScheduledWorkday,
} from './work-schedule.js';

test('scheduled workdays skip weekends, then Fridays from 2026-03-09', () => {
  assert.equal(isScheduledWorkday('2026-03-06'), true);
  assert.equal(isScheduledWorkday('2026-03-07'), false, 'Saturday');
  assert.equal(isScheduledWorkday('2026-03-08'), false, 'Sunday');
  assert.equal(isFourDayWorkweekFriday('2026-03-06'), false);
  assert.equal(isFourDayWorkweekFriday('2026-03-13'), true);
  assert.equal(isScheduledWorkday('2026-03-13'), false);
  assert.equal(getScheduledNonWorkingStatus('2026-03-13'), 'no_ojt');
  assert.equal(getScheduledNonWorkingStatus('2026-03-12'), '');
});

test('the daily overtime threshold steps up with the four-day week', () => {
  assert.equal(getDailyOvertimeThreshold('2026-03-06'), 8);
  assert.equal(getDailyOvertimeThreshold('2026-03-09'), 10);
  assert.equal(calculateOvertimeForDate('2026-03-06', 9.5), 1.5);
  assert.equal(calculateOvertimeForDate('2026-03-09', 9.5), 0);
  assert.equal(calculateOvertimeForDate('2026-03-09', 11), 1);
  assert.equal(calculateOvertimeForDate('2026-03-09', 4), 0);
  assert.equal(calculateOvertimeForDate('', 99), 91);
});

test('getScheduledWorkWindow returns the historical split only inside its range', () => {
  assert.equal(getScheduledWorkWindow('2026-02-02').isSplit, true);
  assert.equal(getScheduledWorkWindow('2026-03-08').expectedTimeIn, '07:30');
  assert.equal(getScheduledWorkWindow('2026-03-09').isSplit, false);
  assert.equal(getScheduledWorkWindow('2026-01-30').isSplit, false);

  const profile = getScheduledWorkWindow('2026-04-06', { expectedTimeIn: '09:00', expectedTimeOut: '18:00' });
  assert.equal(profile.isSplit, false);
  assert.equal(profile.expectedTimeIn, '09:00');
  assert.equal(profile.expectedTimeOut, '18:00');
  // A missing setting falls back rather than producing an empty window.
  assert.equal(getScheduledWorkWindow('2026-04-06', {}).expectedTimeIn, '08:00');
});

test('getScheduleSegments groups contiguous dates that share a schedule', () => {
  const segments = getScheduleSegments('2026-02-27', '2026-03-10', {
    expectedTimeIn: '08:00',
    expectedTimeOut: '17:00',
  });

  assert.deepEqual(
    segments.map(segment => [segment.startDate, segment.endDate, segment.isSplit]),
    [
      ['2026-02-27', '2026-03-08', true],
      ['2026-03-09', '2026-03-10', false],
    ],
  );
  assert.equal(segments[1].expectedTimeIn, '08:00');
});

test('getScheduleSegments can skip non-workdays so a skipped day does not split a run', () => {
  // Monday to the following week. 2026-03-14 and 2026-03-15 are the weekend and
  // 2026-03-13 is the four-day-week Friday, so all three are skipped.
  assert.deepEqual(
    getScheduleSegments('2026-03-09', '2026-03-15', {}, { workdaysOnly: true }).map(s => [s.startDate, s.endDate]),
    [['2026-03-09', '2026-03-12']],
  );
  // The same range including non-workdays stays one contiguous run.
  assert.deepEqual(
    getScheduleSegments('2026-03-09', '2026-03-15', {}).map(s => [s.startDate, s.endDate]),
    [['2026-03-09', '2026-03-15']],
  );
});

test('getScheduleSegments rejects an inverted or empty range', () => {
  assert.deepEqual(getScheduleSegments('', '2026-03-10', {}), []);
  assert.deepEqual(getScheduleSegments('2026-03-10', '', {}), []);
  assert.deepEqual(getScheduleSegments('2026-03-10', '2026-03-01', {}), []);
});