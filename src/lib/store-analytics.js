export function computeSummaryStats(entries, normalizeEntryStatus) {
  const attendedDates = new Set();
  const stats = {
    totalHours: 0,
    totalOvertime: 0,
    totalLateMinutes: 0,
    totalUndertimeMinutes: 0,
    daysAttended: 0,
  };

  for (const entry of entries) {
    const status = normalizeEntryStatus(entry);
    if (status !== 'present') continue;

    stats.totalHours += parseFloat(entry.hoursRendered) || 0;
    stats.totalOvertime += parseFloat(entry.overtimeHours) || 0;
    stats.totalLateMinutes += parseInt(entry.lateMinutes) || 0;
    stats.totalUndertimeMinutes += parseInt(entry.undertimeMinutes) || 0;
    if (entry.amTimeOut || entry.pmTimeOut) {
      attendedDates.add(entry.date);
    }
  }

  stats.daysAttended = attendedDates.size;
  return stats;
}

export function computeTrendData(entries, getWeekStartKey) {
  const monthly = Object.create(null);
  const weekly = Object.create(null);

  for (const entry of entries) {
    if (!entry.amTimeOut && !entry.pmTimeOut) continue;

    const monthKey = entry.date.slice(0, 7);
    if (!monthly[monthKey]) {
      monthly[monthKey] = { hours: 0, ot: 0, late: 0, undertime: 0, days: 0 };
    }
    monthly[monthKey].hours += entry.hoursRendered || 0;
    monthly[monthKey].ot += entry.overtimeHours || 0;
    monthly[monthKey].late += entry.lateMinutes || 0;
    monthly[monthKey].undertime += entry.undertimeMinutes || 0;
    monthly[monthKey].days += 1;

    const weekKey = getWeekStartKey(entry.date);
    if (!weekly[weekKey]) {
      weekly[weekKey] = { hours: 0, days: 0 };
    }
    weekly[weekKey].hours += entry.hoursRendered || 0;
    weekly[weekKey].days += 1;
  }

  return { monthly, weekly };
}

export function computeStatusSummary({ entries, holidays, normalizeEntryStatus, getEntryByDate }) {
  const summary = {
    present: 0,
    leave: 0,
    vacation: 0,
    holiday: 0,
    no_ojt: 0,
    absent: 0,
  };

  entries.forEach(entry => {
    const status = normalizeEntryStatus(entry);
    if (Object.hasOwn(summary, status)) summary[status] += 1;
  });

  holidays.forEach(holiday => {
    if (getEntryByDate(holiday.date)) return;
    if (holiday.type === 'holiday') summary.holiday += 1;
    else if (holiday.type === 'vacation_leave') summary.vacation += 1;
    else summary.leave += 1;
  });

  return summary;
}

export function computeAttendanceSummary({ entries, normalizeEntryStatus, statusSummary }) {
  let present = 0;
  let late = 0;

  entries.forEach(e => {
    const status = normalizeEntryStatus(e);
    if (status === 'present' && (e.amTimeOut || e.pmTimeOut)) present++;
    if (status === 'present' && e.lateMinutes > 0) late++;
  });

  return {
    present,
    late,
    onLeave: statusSummary.leave + statusSummary.vacation + statusSummary.no_ojt,
    holidays: statusSummary.holiday,
  };
}

export function computeDataQualityAlerts(entriesWithDerivedStatus) {
  const alerts = [];

  entriesWithDerivedStatus.forEach(entry => {
    if (entry.status !== 'present') return;

    if ((entry.amTimeIn && !entry.amTimeOut) || (entry.pmTimeIn && !entry.pmTimeOut)) {
      alerts.push({ type: 'incomplete', date: entry.date, message: 'Present day has an incomplete clock pair.' });
    }
    if ((parseFloat(entry.hoursRendered) || 0) > 0 && !String(entry.activities || '').trim()) {
      alerts.push({ type: 'missing_activity', date: entry.date, message: 'Worked day is missing activity details.' });
    }
    if ((parseFloat(entry.hoursRendered) || 0) > 0 && (parseFloat(entry.hoursRendered) || 0) < 4) {
      alerts.push({ type: 'short_day', date: entry.date, message: 'Worked day looks unusually short.' });
    }
  });

  return alerts;
}

export function computeSummaryPack({ entriesWithDerivedStatus, dateFrom, dateTo }) {
  const entries = entriesWithDerivedStatus
    .filter(entry => (!dateFrom || entry.date >= dateFrom) && (!dateTo || entry.date <= dateTo));

  const totals = entries.reduce((acc, entry) => {
    acc.totalHours += parseFloat(entry.hoursRendered) || 0;
    acc.totalOvertime += parseFloat(entry.overtimeHours) || 0;
    acc.totalLate += parseInt(entry.lateMinutes) || 0;
    acc.totalUndertime += parseInt(entry.undertimeMinutes) || 0;
    acc.statuses[entry.status] = (acc.statuses[entry.status] || 0) + 1;
    return acc;
  }, {
    totalHours: 0,
    totalOvertime: 0,
    totalLate: 0,
    totalUndertime: 0,
    statuses: { present: 0, leave: 0, vacation: 0, holiday: 0, no_ojt: 0, absent: 0 },
  });

  const activityCounts = new Map();
  entries.forEach(entry => {
    String(entry.activities || '')
      .split(/\n|;/)
      .map(item => item.trim())
      .filter(Boolean)
      .forEach(item => activityCounts.set(item, (activityCounts.get(item) || 0) + 1));
  });

  const highlights = [...activityCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([activity, count]) => ({ activity, count }));

  return {
    ...totals,
    entries,
    highlights,
    narrative: `Completed ${totals.totalHours.toFixed(1)} hours with ${totals.statuses.present} present day(s) in the selected period.`,
  };
}

export function computeCurrentWeekHours(entries, normalizeEntryStatus, now = new Date()) {
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const sundayStr = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;

  return entries
    .filter(e => e.date >= mondayStr && e.date <= sundayStr && normalizeEntryStatus(e) === 'present')
    .reduce((s, e) => s + (parseFloat(e.hoursRendered) || 0), 0);
}

export function resolveEntryOrStatusByDate({ date, entry, holiday, scheduledNonWorkingStatus, normalizeEntryStatus }) {
  if (entry) return { ...entry, status: normalizeEntryStatus(entry), source: 'entry' };

  if (!holiday) {
    if (!scheduledNonWorkingStatus) return null;

    return {
      id: `status-${date}`,
      date,
      status: scheduledNonWorkingStatus,
      amTimeIn: '',
      amTimeOut: '',
      pmTimeIn: '',
      pmTimeOut: '',
      hoursRendered: 0,
      overtimeHours: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
      remarks: '',
      activities: '',
      source: 'schedule',
    };
  }

  return {
    id: `status-${date}`,
    date,
    status: holiday.type === 'holiday' ? 'holiday' : holiday.type === 'vacation_leave' ? 'vacation' : 'leave',
    amTimeIn: '',
    amTimeOut: '',
    pmTimeIn: '',
    pmTimeOut: '',
    hoursRendered: 0,
    overtimeHours: 0,
    lateMinutes: 0,
    undertimeMinutes: 0,
    remarks: holiday.name || '',
    activities: '',
    source: 'holiday',
  };
}

export function computeCompletionEstimate(forecast) {
  if (!forecast) return null;
  return {
    avgPerDay: forecast.avgPerDay,
    daysNeeded: forecast.workingDaysRemaining,
    estimatedDate: forecast.estimatedDate,
    remainingHours: forecast.remainingHours,
    neededAvgHoursPerDay: forecast.neededAvgHoursPerDay,
    excludedDates: forecast.excludedDates,
  };
}
import { buildCompletionForecast } from '../../shared/forecast.js';

export function computeCompletionForecast({ today, requiredHours, entries, holidays, resolveStatus, isWorkday, isExcluded }) {
  return buildCompletionForecast({
    today,
    requiredHours,
    entries,
    holidays,
    resolveStatus,
    isWorkday,
    isExcluded,
  });
}
