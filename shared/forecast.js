import { toLocalDateString } from './time.js';

// Forecast domain rules live here, not in the server core or the client store,
// so a threshold change cannot land on one side only.
const RECENT_FORECAST_DAYS = 5;
const MAX_FORECAST_DAYS = 366 * 3;
const REALISTIC_MAX_HOURS_PER_DAY = 8;
const MIN_SCENARIO_AVG_HOURS_PER_DAY = 0.25;
const LOW_CONFIDENCE_COMPLETE_DAYS = 3;
const TREND_DELTA_THRESHOLD_HOURS = 0.75;
const SCENARIO_ORDER = ['conservative', 'expected', 'optimistic'];
const SCENARIO_LABELS = {
  conservative: 'Conservative',
  expected: 'Expected',
  optimistic: 'Optimistic',
};

// Pure working-day counter shared by server and client forecasts.
// startDate is YYYY-MM-DD. statusByDate maps dates to statuses (or undefined).
// isWorkday decides schedule days. isExcluded decides dates to skip and record.
// The scan is bounded by maxDays so a near-zero pace cannot walk the calendar
// forever; a truncated scan still returns the furthest date it reached.
function countWorkingDays({ startDate, daysNeeded, statusByDate = new Map(), isWorkday, isExcluded, maxDays = MAX_FORECAST_DAYS }) {
  const excludedDates = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  let countedDays = 0;
  let scannedDays = 0;

  while (countedDays < daysNeeded && scannedDays < maxDays) {
    scannedDays += 1;
    cursor.setDate(cursor.getDate() + 1);
    const dateKey = toLocalDateString(cursor);
    if (!isWorkday(dateKey)) {
      continue;
    }
    const status = statusByDate.get(dateKey);
    if (isExcluded(status, dateKey)) {
      excludedDates.push({ date: dateKey, status });
      continue;
    }
    countedDays += 1;
  }

  return { estimatedDate: toLocalDateString(cursor), excludedDates };
}

function holidayStatus(type) {
  if (type === 'holiday') return 'holiday';
  if (type === 'vacation_leave') return 'vacation';
  return 'leave';
}

// A worked day counts toward the pace average only when its clock pairs are
// complete, so half-entered days cannot drag the estimate.
function hasCompleteWorkedClockPair(entry = {}) {
  if (entry.amTimeIn && entry.amTimeOut) return true;
  if (entry.pmTimeIn && entry.pmTimeOut) return true;
  return !entry.amTimeIn && !entry.amTimeOut && !entry.pmTimeIn && !entry.pmTimeOut;
}

function normalizeForecastEntry(entry = {}, resolveStatus) {
  const status = resolveStatus(entry);
  const hoursRendered = Math.max(0, Number(entry?.hoursRendered) || 0);
  const isWorkedDay = status === 'present' && hoursRendered > 0;
  const hasPairs = hasCompleteWorkedClockPair(entry);
  return {
    ...entry,
    date: entry?.date || '',
    status,
    hoursRendered,
    isCompleteWorkedDay: isWorkedDay && hasPairs,
    isIncompleteWorkedDay: isWorkedDay && !hasPairs,
  };
}

function averageHours(entries = []) {
  if (!entries.length) return 0;
  return entries.reduce((sum, entry) => sum + entry.hoursRendered, 0) / entries.length;
}

// Recent pace counts double so a steady history is not overruled by one slow week.
function weightedAverageHours(entries = []) {
  const lifetimeAvgPerDay = averageHours(entries);
  const recentAvgPerDay = averageHours(entries.slice(-RECENT_FORECAST_DAYS));
  return ((recentAvgPerDay * 2) + lifetimeAvgPerDay) / 3;
}

export function buildStatusMap(entries = [], holidays = []) {
  const statusByDate = new Map();

  entries.forEach(entry => {
    if (!entry?.date) return;
    statusByDate.set(entry.date, entry.status);
  });

  holidays.forEach(holiday => {
    if (!holiday?.date || statusByDate.has(holiday.date)) return;
    statusByDate.set(holiday.date, holidayStatus(holiday.type));
  });

  return statusByDate;
}

function projectScenario({ label, avgPerDay, remainingHours, today, statusByDate, isWorkday, isExcluded }) {
  const safeAvg = Math.max(0, Number(avgPerDay) || 0);
  const workingDaysRemaining = safeAvg > 0 ? Math.ceil(remainingHours / safeAvg) : 0;
  const { estimatedDate, excludedDates } = countWorkingDays({
    startDate: today,
    daysNeeded: workingDaysRemaining,
    statusByDate,
    isWorkday,
    isExcluded,
  });

  return {
    label,
    avgPerDay: safeAvg,
    workingDaysRemaining,
    neededAvgHoursPerDay: workingDaysRemaining > 0 ? remainingHours / workingDaysRemaining : 0,
    estimatedDate,
    excludedDates,
  };
}

function getForecastConfidence({ completeCount, incompleteCount, lifetimeAvgPerDay, recentAvgPerDay, remainingHours }) {
  const confidenceReasons = [];
  let confidence = 'high';

  if (completeCount < LOW_CONFIDENCE_COMPLETE_DAYS) {
    confidence = 'low';
    confidenceReasons.push(`Only ${completeCount} complete worked day(s) available.`);
  } else if (completeCount < RECENT_FORECAST_DAYS) {
    confidence = 'medium';
    confidenceReasons.push(`Only ${completeCount} complete worked day(s) available for trend weighting.`);
  }

  if (incompleteCount > 0) {
    confidence = confidence === 'high' ? 'medium' : confidence;
    confidenceReasons.push(`${incompleteCount} present day(s) have rendered hours but incomplete clock pairs.`);
  }

  if (Math.abs(recentAvgPerDay - lifetimeAvgPerDay) >= TREND_DELTA_THRESHOLD_HOURS) {
    confidenceReasons.push('Recent pace differs from the full-history average.');
  }

  if (!confidenceReasons.length) {
    confidenceReasons.push(remainingHours === 0
      ? 'Required hours are complete.'
      : 'Forecast is based on complete worked days with a stable recent trend.');
  }

  return { confidence, confidenceReasons };
}

function buildForecastSuggestions({ incompleteCount, lifetimeAvgPerDay, recentAvgPerDay, expectedScenario, excludedCount, remainingHours }) {
  const suggestions = [];

  if (incompleteCount > 0) {
    suggestions.push(`Complete clock pairs for ${incompleteCount} present day(s) to improve forecast accuracy.`);
  }

  if (recentAvgPerDay - lifetimeAvgPerDay >= TREND_DELTA_THRESHOLD_HOURS) {
    suggestions.push('Recent pace is faster than your full-history average, so the expected date was pulled earlier.');
  } else if (lifetimeAvgPerDay - recentAvgPerDay >= TREND_DELTA_THRESHOLD_HOURS) {
    suggestions.push('Recent pace is slower than your full-history average, so the expected date was pushed later.');
  }

  if (excludedCount > 0) {
    suggestions.push(`${excludedCount} known non-working day(s) were excluded from the forecast.`);
  }

  if (remainingHours === 0) {
    suggestions.push('Required OJT hours are complete.');
  } else if (expectedScenario.workingDaysRemaining > 0) {
    suggestions.push(`Keep about ${expectedScenario.neededAvgHoursPerDay.toFixed(1)}h per working day to hit the expected date.`);
  }

  return suggestions;
}

// Single completion-forecast engine for the server core and the client store.
// resolveStatus maps an entry to its status string; isWorkday and isExcluded
// carry the caller's schedule rules. today is a validated YYYY-MM-DD string.
// Returns null when there is no complete worked day to average.
export function buildCompletionForecast({
  today,
  requiredHours,
  entries = [],
  holidays = [],
  resolveStatus,
  isWorkday,
  isExcluded,
} = {}) {
  const forecastEntries = entries
    .filter(entry => entry?.date)
    .map(entry => normalizeForecastEntry(entry, resolveStatus));
  const completeWorkedEntries = forecastEntries
    .filter(entry => entry.isCompleteWorkedDay)
    .sort((a, b) => a.date.localeCompare(b.date));
  const incompleteWorkedEntries = forecastEntries.filter(entry => entry.isIncompleteWorkedDay);

  if (!completeWorkedEntries.length) return null;

  const totalHours = forecastEntries
    .filter(entry => entry.status === 'present')
    .reduce((sum, entry) => sum + entry.hoursRendered, 0);
  const completeTotalHours = completeWorkedEntries.reduce((sum, entry) => sum + entry.hoursRendered, 0);
  const lifetimeAvgPerDay = averageHours(completeWorkedEntries);
  const recentAvgPerDay = averageHours(completeWorkedEntries.slice(-RECENT_FORECAST_DAYS));
  const weightedAvgPerDay = weightedAverageHours(completeWorkedEntries);

  if (weightedAvgPerDay <= 0) return null;

  const remainingHours = Math.max(0, (Number(requiredHours) || 0) - totalHours);
  const statusByDate = buildStatusMap(forecastEntries, holidays);
  const avgByScenario = {
    conservative: Math.max(
      MIN_SCENARIO_AVG_HOURS_PER_DAY,
      Math.min(lifetimeAvgPerDay, recentAvgPerDay, weightedAvgPerDay),
    ),
    expected: weightedAvgPerDay,
    optimistic: Math.min(
      REALISTIC_MAX_HOURS_PER_DAY,
      Math.max(lifetimeAvgPerDay, recentAvgPerDay, weightedAvgPerDay),
    ),
  };
  const scenarios = Object.fromEntries(SCENARIO_ORDER.map(key => [key, projectScenario({
    label: SCENARIO_LABELS[key],
    avgPerDay: avgByScenario[key],
    remainingHours,
    today,
    statusByDate,
    isWorkday,
    isExcluded,
  })]));
  const expected = scenarios.expected;
  const { confidence, confidenceReasons } = getForecastConfidence({
    completeCount: completeWorkedEntries.length,
    incompleteCount: incompleteWorkedEntries.length,
    lifetimeAvgPerDay,
    recentAvgPerDay,
    remainingHours,
  });

  return {
    totalHours,
    completeTotalHours,
    lifetimeAvgPerDay,
    recentAvgPerDay,
    weightedAvgPerDay,
    avgPerDay: expected.avgPerDay,
    remainingHours,
    workingDaysRemaining: expected.workingDaysRemaining,
    neededAvgHoursPerDay: expected.neededAvgHoursPerDay,
    estimatedDate: expected.estimatedDate,
    excludedDates: expected.excludedDates,
    confidence,
    confidenceReasons,
    suggestions: buildForecastSuggestions({
      incompleteCount: incompleteWorkedEntries.length,
      lifetimeAvgPerDay,
      recentAvgPerDay,
      expectedScenario: expected,
      excludedCount: expected.excludedDates.length,
      remainingHours,
    }),
    scenarios,
  };
}