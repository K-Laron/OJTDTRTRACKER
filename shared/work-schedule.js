import { toLocalDateString } from './time.js';

export const FOUR_DAY_WORKWEEK_START = '2026-03-09';
export const HISTORICAL_SPLIT_SCHEDULE_START = '2026-02-02';
export const HISTORICAL_SPLIT_SCHEDULE_END = '2026-03-08';

const DEFAULT_EXPECTED_TIME_IN = '08:00';
const DEFAULT_EXPECTED_TIME_OUT = '17:00';
const DEFAULT_DAILY_OVERTIME_THRESHOLD_HOURS = 8;
const FOUR_DAY_DAILY_OVERTIME_THRESHOLD_HOURS = 10;

// Before the four-day week started the office ran a fixed AM/PM split, so
// late and undertime for those dates are measured against the split rather
// than against whatever the profile says now.
const HISTORICAL_SPLIT_SCHEDULE = Object.freeze({
  key: 'split:07:30-11:30-13:00-17:00',
  expectedTimeIn: '07:30',
  expectedTimeOut: '17:00',
  amTimeIn: '07:30',
  amTimeOut: '11:30',
  pmTimeIn: '13:00',
  pmTimeOut: '17:00',
  isSplit: true,
});

function getDayOfWeek(dateString) {
  return new Date(`${dateString}T00:00:00`).getDay();
}

function isDateWithinRange(dateString, startDate, endDate) {
  return Boolean(dateString) && dateString >= startDate && dateString <= endDate;
}

function buildProfileSchedule(settings = {}) {
  const expectedTimeIn = String(settings.expectedTimeIn || DEFAULT_EXPECTED_TIME_IN);
  const expectedTimeOut = String(settings.expectedTimeOut || DEFAULT_EXPECTED_TIME_OUT);

  return {
    key: `single:${expectedTimeIn}-${expectedTimeOut}`,
    expectedTimeIn,
    expectedTimeOut,
    amTimeIn: '',
    amTimeOut: '',
    pmTimeIn: '',
    pmTimeOut: '',
    isSplit: false,
  };
}

export function isFourDayWorkweekFriday(dateString = '') {
  return Boolean(dateString)
    && dateString >= FOUR_DAY_WORKWEEK_START
    && getDayOfWeek(dateString) === 5;
}

export function isScheduledWorkday(dateString = '') {
  const day = getDayOfWeek(dateString);
  if (day === 0 || day === 6) return false;
  if (isFourDayWorkweekFriday(dateString)) return false;
  return true;
}

export function getScheduledNonWorkingStatus(dateString = '') {
  return isFourDayWorkweekFriday(dateString) ? 'no_ojt' : '';
}

export function getDailyOvertimeThreshold(dateString = '') {
  return Boolean(dateString) && dateString >= FOUR_DAY_WORKWEEK_START
    ? FOUR_DAY_DAILY_OVERTIME_THRESHOLD_HOURS
    : DEFAULT_DAILY_OVERTIME_THRESHOLD_HOURS;
}

export function calculateOvertimeForDate(dateString, hoursRendered) {
  return Math.max(0, (Number(hoursRendered) || 0) - getDailyOvertimeThreshold(dateString));
}

export function getScheduledWorkWindow(dateString = '', settings = {}) {
  if (isDateWithinRange(dateString, HISTORICAL_SPLIT_SCHEDULE_START, HISTORICAL_SPLIT_SCHEDULE_END)) {
    return { ...HISTORICAL_SPLIT_SCHEDULE };
  }

  return buildProfileSchedule(settings);
}

// Contiguous runs of dates that share one schedule, so a summary can print
// "08:00 - 17:00" for a normal month and name each stretch that differs.
export function getScheduleSegments(startDate = '', endDate = '', settings = {}, { workdaysOnly = false } = {}) {
  if (!startDate || !endDate || startDate > endDate) return [];

  const segments = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const lastDate = new Date(`${endDate}T00:00:00`);
  let currentSegment = null;

  while (cursor <= lastDate) {
    const dateKey = toLocalDateString(cursor);
    cursor.setDate(cursor.getDate() + 1);

    if (workdaysOnly && !isScheduledWorkday(dateKey)) continue;

    const schedule = getScheduledWorkWindow(dateKey, settings);
    if (currentSegment?.key === schedule.key) {
      currentSegment.endDate = dateKey;
      continue;
    }

    if (currentSegment) segments.push(currentSegment);
    currentSegment = { startDate: dateKey, endDate: dateKey, ...schedule };
  }

  if (currentSegment) segments.push(currentSegment);

  return segments;
}