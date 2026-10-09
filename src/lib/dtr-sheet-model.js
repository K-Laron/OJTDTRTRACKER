import { MONTHS, formatHolidayTypeLabel } from '../../shared/labels.js';
import { calculateOvertimeForDate, getScheduledNonWorkingStatus, isScheduledWorkday } from '../../shared/work-schedule.js';
import { fmtTimeStr, formatScheduleSummary, getDaysInMonth, getFullDayName } from '../utils.js';

// One row per calendar day of the month, whether or not it has an entry.
// Column sets are deliberately not declared here: the on-screen sheet, the
// PDF and the spreadsheet want different columns, and each owns its own
// headers next to its own body mapping.

function getHolidayStatus(holiday) {
  if (!holiday) return '';
  if (holiday.type === 'holiday') return 'holiday';
  if (holiday.type === 'vacation_leave') return 'vacation';
  return 'leave';
}

export function getFallbackEntryStatus(entry = {}) {
  if (entry.status) return entry.status;
  return (entry.amTimeIn || entry.amTimeOut || entry.pmTimeIn || entry.pmTimeOut || entry.hoursRendered)
    ? 'present'
    : 'absent';
}

function getDateString(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function hasClockOut(entry) {
  return Boolean(entry?.amTimeOut || entry?.pmTimeOut);
}

function buildRow({ day, date, entry, holiday, resolveStatus }) {
  const status = entry ? resolveStatus(entry) : (getHolidayStatus(holiday) || getScheduledNonWorkingStatus(date));
  const isPresent = !status || status === 'present';
  const hoursRendered = isPresent ? (Number(entry?.hoursRendered) || 0) : 0;

  return {
    day,
    date,
    dayName: getFullDayName(date),
    status,
    statusLabel: status ? formatHolidayTypeLabel(status) : '',
    isPresent,
    // Muted rows carry no work record: weekends, holidays and four-day-week Fridays.
    isMuted: !isScheduledWorkday(date) || Boolean(holiday) || status === 'no_ojt',
    amTimeIn: isPresent ? fmtTimeStr(entry?.amTimeIn) : '',
    amTimeOut: isPresent ? fmtTimeStr(entry?.amTimeOut) : '',
    pmTimeIn: isPresent ? fmtTimeStr(entry?.pmTimeIn) : '',
    pmTimeOut: isPresent ? fmtTimeStr(entry?.pmTimeOut) : '',
    hoursRendered,
    // Derived values are recomputed rather than trusted, so a stale stored row
    // cannot print a number that disagrees with the times above it.
    overtimeHours: isPresent ? calculateOvertimeForDate(date, hoursRendered) : 0,
    lateMinutes: isPresent ? (Number(entry?.lateMinutes) || 0) : 0,
    undertimeMinutes: isPresent ? (Number(entry?.undertimeMinutes) || 0) : 0,
    hasClockOut: isPresent && hasClockOut(entry),
    activities: entry?.activities || holiday?.name || '',
    remarks: entry?.remarks || (status ? formatHolidayTypeLabel(status) : ''),
    holiday,
    entry,
  };
}

export function buildDtrSheetModel({
  entries = [],
  holidays = [],
  month,
  year,
  profile = {},
  settings = {},
  getEntryStatus,
} = {}) {
  const resolveStatus = getEntryStatus || getFallbackEntryStatus;
  const entriesByDate = new Map(entries.map(entry => [entry.date, entry]));
  const holidaysByDate = new Map(holidays.map(holiday => [holiday.date, holiday]));
  const daysInMonth = getDaysInMonth(year, month);
  const rows = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = getDateString(year, month, day);
    rows.push(buildRow({
      day,
      date,
      entry: entriesByDate.get(date),
      holiday: holidaysByDate.get(date),
      resolveStatus,
    }));
  }

  const completed = rows.filter(row => row.hasClockOut);

  return {
    rows,
    month,
    year,
    monthLabel: `${MONTHS[month]} ${year}`,
    profile,
    scheduleText: formatScheduleSummary(
      getDateString(year, month, 1),
      getDateString(year, month, daysInMonth),
      settings,
    ),
    // Totals cover exactly the rows that print a figure, so a total always
    // equals the sum of the column above it in any view.
    totals: {
      totalHours: completed.reduce((sum, row) => sum + row.hoursRendered, 0),
      totalOvertime: completed.reduce((sum, row) => sum + row.overtimeHours, 0),
      daysWorked: completed.length,
    },
  };
}