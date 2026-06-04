import { getDailyOvertimeThreshold } from './work-schedule.js';

const TIME_RE = /^\d{2}:\d{2}$/;

export function parseDtrTime(value) {
  if (!value || !TIME_RE.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

export function calculateDtrHours(timeIn, timeOut, breakMins = 0) {
  const start = parseDtrTime(timeIn);
  const end = parseDtrTime(timeOut);
  if (start == null || end == null) return 0;
  return Math.max(0, (end - start - breakMins) / 60);
}

export function calculateDtrEntryHours(entry = {}) {
  let total = 0;
  if (entry.amTimeIn && entry.amTimeOut) total += calculateDtrHours(entry.amTimeIn, entry.amTimeOut);
  if (entry.pmTimeIn && entry.pmTimeOut) total += calculateDtrHours(entry.pmTimeIn, entry.pmTimeOut);
  return total;
}

export function calculateDtrOvertime(date, hoursRendered) {
  return Math.max(0, (Number(hoursRendered) || 0) - getDailyOvertimeThreshold(date));
}

export function formatOvertimeDuration(hours, options = {}) {
  const totalMinutes = Math.round((Number(hours) || 0) * 60);
  if (totalMinutes <= 0) return options.blankZero ? '' : '0 min';

  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hrs === 0) return `${mins} min`;
  if (mins === 0) return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'}`;
  return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'} ${mins} min`;
}

export function formatDtrDayName(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
}
