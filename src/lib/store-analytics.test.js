import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAttendanceSummary,
  computeCurrentWeekHours,
  computeDataQualityAlerts,
  computeStatusSummary,
  computeSummaryPack,
  computeSummaryStats,
  computeTrendData,
} from './store-analytics.js';
import { normalizeEntryStatus } from './entries.js';

test('computeSummaryStats aggregates hours, overtime, late, and undertime', () => {
  const entries = [
    { date: '2026-03-02', status: 'present', hoursRendered: 8, overtimeHours: 1, lateMinutes: 10, undertimeMinutes: 0, amTimeOut: '12:00' },
    { date: '2026-03-03', status: 'present', hoursRendered: 9, overtimeHours: 2, lateMinutes: 0, undertimeMinutes: 15, pmTimeOut: '17:00' },
    { date: '2026-03-04', status: 'leave', hoursRendered: 8, overtimeHours: 0, lateMinutes: 0, undertimeMinutes: 0 },
  ];

  const stats = computeSummaryStats(entries, normalizeEntryStatus);
  assert.equal(stats.totalHours, 17);
  assert.equal(stats.totalOvertime, 3);
  assert.equal(stats.totalLateMinutes, 10);
  assert.equal(stats.totalUndertimeMinutes, 15);
  assert.equal(stats.daysAttended, 2);
});

test('computeTrendData groups by month and week key', () => {
  const entries = [
    { date: '2026-03-02', amTimeOut: '12:00', hoursRendered: 8, overtimeHours: 1, lateMinutes: 0, undertimeMinutes: 0 },
    { date: '2026-03-03', pmTimeOut: '17:00', hoursRendered: 8, overtimeHours: 0, lateMinutes: 5, undertimeMinutes: 0 },
  ];

  const trends = computeTrendData(entries, (date) => '2026-03-02');
  assert.equal(trends.monthly['2026-03'].hours, 16);
  assert.equal(trends.monthly['2026-03'].days, 2);
  assert.equal(trends.weekly['2026-03-02'].hours, 16);
  assert.equal(trends.weekly['2026-03-02'].days, 2);
});

test('computeStatusSummary counts entry and holiday categories without duplication', () => {
  const entries = [
    { date: '2026-03-02', status: 'present' },
    { date: '2026-03-03', status: 'leave' },
  ];
  const holidays = [
    { date: '2026-03-02', type: 'holiday' }, // date already in entries, skipped
    { date: '2026-03-04', type: 'holiday' },
    { date: '2026-03-05', type: 'vacation_leave' },
  ];

  const summary = computeStatusSummary({
    entries,
    holidays,
    normalizeEntryStatus,
    getEntryByDate: (date) => entries.find(e => e.date === date),
  });

  assert.equal(summary.present, 1);
  assert.equal(summary.leave, 1);
  assert.equal(summary.holiday, 1);
  assert.equal(summary.vacation, 1);
});

test('computeDataQualityAlerts identifies incomplete clock pairs, short days, and missing activities', () => {
  const entries = [
    { date: '2026-03-02', status: 'present', amTimeIn: '08:00', amTimeOut: '', hoursRendered: 0 },
    { date: '2026-03-03', status: 'present', hoursRendered: 3, activities: '' },
  ];

  const alerts = computeDataQualityAlerts(entries);
  assert.equal(alerts.length, 3);
  assert.equal(alerts.some(a => a.type === 'incomplete'), true);
  assert.equal(alerts.some(a => a.type === 'missing_activity'), true);
  assert.equal(alerts.some(a => a.type === 'short_day'), true);
});

test('computeCurrentWeekHours calculates hours within the active Monday-Sunday window', () => {
  const entries = [
    { date: '2026-03-02', status: 'present', hoursRendered: 8 },
    { date: '2026-03-03', status: 'present', hoursRendered: 8 },
    { date: '2026-02-25', status: 'present', hoursRendered: 8 }, // prior week
  ];
  const wednesday = new Date('2026-03-04T12:00:00');
  const weekHours = computeCurrentWeekHours(entries, normalizeEntryStatus, wednesday);
  assert.equal(weekHours, 16);
});
