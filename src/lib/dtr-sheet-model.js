import {
  MONTHS,
  calculateOvertimeForDate,
  fmtTimeStr,
  formatOvertimeDuration,
  formatScheduleSummary,
  getDaysInMonth,
  getFullDayName,
} from '../utils.js';
import { getScheduledNonWorkingStatus } from '../../shared/work-schedule.js';

export const DTR_SHEET_COLUMNS = [
  'Day',
  'Day',
  'AM In',
  'AM Out',
  'PM In',
  'PM Out',
  'Hrs',
  'OT',
  'Remarks',
];

function titleCaseStatus(status = '') {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function getHolidayStatus(holiday) {
  if (!holiday) return '';
  if (holiday.type === 'holiday') return 'holiday';
  if (holiday.type === 'vacation_leave') return 'vacation';
  return 'leave';
}

function getFallbackEntryStatus(entry = {}) {
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

function formatRemarks({ entry, holiday, statusLabel }) {
  if (entry?.remarks) return entry.remarks;
  if (holiday?.type === 'holiday' && holiday.name) return `Holiday - ${holiday.name}`;
  return statusLabel || '';
}

function buildRow({ day, date, entry, holiday, getEntryStatus }) {
  const dayName = getFullDayName(date);
  const scheduledStatus = getScheduledNonWorkingStatus(date);
  const status = entry
    ? getEntryStatus(entry)
    : (getHolidayStatus(holiday) || scheduledStatus);
  const isPresent = !status || status === 'present';
  const isWeekend = dayName === 'Saturday' || dayName === 'Sunday';
  const hoursRendered = Number(entry?.hoursRendered) || 0;
  const overtimeHours = isPresent ? calculateOvertimeForDate(date, hoursRendered) : 0;
  const statusLabel = status ? titleCaseStatus(status) : '';

  return {
    day,
    date,
    dayName,
    status,
    statusLabel,
    isPresent,
    isMuted: isWeekend || Boolean(holiday) || status === 'no_ojt',
    amTimeIn: isPresent ? fmtTimeStr(entry?.amTimeIn) : '',
    amTimeOut: isPresent ? fmtTimeStr(entry?.amTimeOut) : '',
    pmTimeIn: isPresent ? fmtTimeStr(entry?.pmTimeIn) : '',
    pmTimeOut: isPresent ? fmtTimeStr(entry?.pmTimeOut) : '',
    hoursRendered,
    hoursDisplay: isPresent && hasClockOut(entry) ? hoursRendered.toFixed(2) : '',
    overtimeHours,
    overtimeDisplay: formatOvertimeDuration(overtimeHours, { blankZero: true }),
    remarks: formatRemarks({ entry, holiday, statusLabel }),
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
  getEntryStatus = getFallbackEntryStatus,
} = {}) {
  const daysInMonth = getDaysInMonth(year, month);
  const monthStart = getDateString(year, month, 1);
  const monthEnd = getDateString(year, month, daysInMonth);
  const entriesByDate = new Map(entries.map(entry => [entry.date, entry]));
  const holidaysByDate = new Map(holidays.map(holiday => [holiday.date, holiday]));
  const resolveStatus = entry => getEntryStatus(entry) || getFallbackEntryStatus(entry);
  const rows = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = getDateString(year, month, day);
    rows.push(buildRow({
      day,
      date,
      entry: entriesByDate.get(date),
      holiday: holidaysByDate.get(date),
      getEntryStatus: resolveStatus,
    }));
  }

  const totalHours = rows.reduce((sum, row) => sum + (row.isPresent ? row.hoursRendered : 0), 0);
  const totalOvertime = rows.reduce((sum, row) => sum + row.overtimeHours, 0);
  const daysWorked = rows.reduce((count, row) => count + (row.isPresent && hasClockOut(row.entry) ? 1 : 0), 0);

  return {
    rows,
    month,
    year,
    monthLabel: `${MONTHS[month]} ${year}`,
    profile,
    scheduleText: formatScheduleSummary(monthStart, monthEnd, settings),
    totals: {
      totalHours,
      totalOvertime,
      daysWorked,
      totalHoursDisplay: totalHours.toFixed(2),
      totalOvertimeDisplay: formatOvertimeDuration(totalOvertime),
    },
  };
}
