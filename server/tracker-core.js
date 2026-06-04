import { getScheduledWorkWindow, isScheduledWorkday } from '../shared/work-schedule.js';
import {
  calculateDtrEntryHours,
  calculateDtrHours,
  calculateDtrOvertime,
  parseDtrTime,
} from '../shared/dtr-rules.js';

export const DEFAULT_SETTINGS = {
  requiredHours: 486,
  breakDuration: 60,
  expectedTimeIn: '08:00',
  expectedTimeOut: '17:00',
  weeklyTarget: 40,
  autoBackup: 'off',
  lastBackupDate: null,
  notificationsEnabled: false,
  clockInReminder: '08:00',
  clockOutReminder: '17:00',
  timeFormat: '12h',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HOLIDAY_TYPES = new Set(['holiday', 'sick_leave', 'vacation_leave']);
const HOLIDAY_SOURCES = new Set(['manual', 'public_api']);
export const ENTRY_STATUSES = new Set(['present', 'leave', 'vacation', 'holiday', 'no_ojt', 'absent']);
const ENTRY_EDITABLE_FIELDS = ['date', 'status', 'amTimeIn', 'amTimeOut', 'pmTimeIn', 'pmTimeOut', 'remarks', 'activities'];
const RECENT_FORECAST_DAYS = 5;
const MAX_FORECAST_DAYS = 366 * 3;
const REALISTIC_MAX_HOURS_PER_DAY = 8;
const TREND_DELTA_THRESHOLD_HOURS = 0.75;

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseTime(value) {
  return parseDtrTime(value);
}

export function calculateHours(timeIn, timeOut, breakMins = 0) {
  return calculateDtrHours(timeIn, timeOut, breakMins);
}

export function calculateEntryHours(entry) {
  return calculateDtrEntryHours(entry);
}

export function calculateOvertime(hours, threshold = 8) {
  return Math.max(0, hours - threshold);
}

export function calculateOvertimeForDate(date, hours) {
  return calculateDtrOvertime(date, hours);
}

export function calculateLate(timeIn, expected) {
  const actual = parseTime(timeIn);
  const baseline = parseTime(expected);
  if (actual == null || baseline == null) return 0;
  return Math.max(0, actual - baseline);
}

export function calculateUndertime(timeOut, expected) {
  const actual = parseTime(timeOut);
  const baseline = parseTime(expected);
  if (actual == null || baseline == null) return 0;
  return Math.max(0, baseline - actual);
}

function normalizeText(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeStatus(value, fallback = 'absent') {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return fallback;
  if (!ENTRY_STATUSES.has(normalized)) {
    throw new Error('Entry status is invalid');
  }
  return normalized;
}

function isPresentStatus(status) {
  return status === 'present';
}

function isExcludedWorkdayStatus(status) {
  return status === 'holiday' || status === 'leave' || status === 'vacation' || status === 'no_ojt';
}

function normalizeTime(value, label) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (parseTime(normalized) == null) {
    throw new Error(`${label} must be a valid HH:MM time`);
  }
  return normalized;
}

function assertDate(value, label = 'Date') {
  const normalized = normalizeText(value);
  if (!DATE_RE.test(normalized)) {
    throw new Error(`${label} must be in YYYY-MM-DD format`);
  }
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}

export function normalizeSettings(settings = {}) {
  const expectedTimeIn = normalizeTime(settings.expectedTimeIn ?? DEFAULT_SETTINGS.expectedTimeIn, 'Expected Time In');
  const expectedTimeOut = normalizeTime(settings.expectedTimeOut ?? DEFAULT_SETTINGS.expectedTimeOut, 'Expected Time Out');
  const clockInReminder = normalizeTime(settings.clockInReminder ?? expectedTimeIn, 'Clock-In Reminder');
  const clockOutReminder = normalizeTime(settings.clockOutReminder ?? expectedTimeOut, 'Clock-Out Reminder');

  return {
    requiredHours: Math.max(1, Math.round(toNumber(settings.requiredHours, DEFAULT_SETTINGS.requiredHours))),
    breakDuration: Math.max(0, Math.round(toNumber(settings.breakDuration, DEFAULT_SETTINGS.breakDuration))),
    expectedTimeIn,
    expectedTimeOut,
    weeklyTarget: Math.max(1, Math.round(toNumber(settings.weeklyTarget, DEFAULT_SETTINGS.weeklyTarget))),
    autoBackup: ['off', 'weekly', 'monthly'].includes(settings.autoBackup) ? settings.autoBackup : DEFAULT_SETTINGS.autoBackup,
    lastBackupDate: settings.lastBackupDate ? new Date(settings.lastBackupDate).toISOString() : null,
    notificationsEnabled: Boolean(settings.notificationsEnabled),
    clockInReminder,
    clockOutReminder,
    timeFormat: settings.timeFormat === '24h' ? '24h' : '12h',
  };
}

export function normalizeProfile(profile = {}) {
  return {
    name: normalizeText(profile.name),
    department: normalizeText(profile.department),
    school: normalizeText(profile.school),
    supervisor: normalizeText(profile.supervisor),
    position: normalizeText(profile.position) || 'OJT Trainee',
    startDate: profile.startDate ? assertDate(profile.startDate, 'Start Date') : '',
  };
}

export function sanitizeHoliday(input = {}) {
  const date = assertDate(input.date, 'Holiday date');
  const name = normalizeText(input.name);
  const type = normalizeText(input.type) || 'holiday';
  const source = normalizeText(input.source) || 'manual';

  if (!name) {
    throw new Error('Holiday name is required');
  }
  if (!HOLIDAY_TYPES.has(type)) {
    throw new Error('Holiday type is invalid');
  }
  if (!HOLIDAY_SOURCES.has(source)) {
    throw new Error('Holiday source is invalid');
  }

  return { date, name, type, source };
}

function getComparableEntry(entry = {}) {
  return {
    date: entry.date || '',
    status: entry.status || '',
    amTimeIn: entry.amTimeIn || '',
    amTimeOut: entry.amTimeOut || '',
    pmTimeIn: entry.pmTimeIn || '',
    pmTimeOut: entry.pmTimeOut || '',
    remarks: entry.remarks || '',
    activities: entry.activities || '',
  };
}

function normalizeEntryFieldValue(field, value) {
  if (value == null) return '';
  if (field === 'date') return normalizeText(value);
  return normalizeText(value);
}

function getComparableHoliday(holiday = {}) {
  return {
    date: holiday.date || '',
    name: holiday.name || '',
    type: holiday.type || '',
    source: holiday.source || 'manual',
  };
}

function getComparableConfig(config = {}) {
  return {
    profile: normalizeProfile(config.profile || {}),
    settings: normalizeSettings(config.settings || {}),
    theme: config.theme === 'light' ? 'light' : 'dark',
  };
}

export function entriesConflict(currentEntry, previousState) {
  if (!previousState) return false;
  return JSON.stringify(getComparableEntry(currentEntry)) !== JSON.stringify(getComparableEntry(previousState));
}

export function resolveEntryUpdate(currentEntry, previousState, updates, settings = DEFAULT_SETTINGS) {
  if (!previousState || !entriesConflict(currentEntry, previousState)) {
    return {
      type: 'direct',
      entry: sanitizeEntry(updates, settings, { existingEntry: currentEntry, requireId: true }),
      conflictingFields: [],
      clientChangedFields: [],
      serverChangedFields: [],
    };
  }

  const currentComparable = getComparableEntry(currentEntry);
  const previousComparable = getComparableEntry(previousState);
  const clientChangedFields = ENTRY_EDITABLE_FIELDS.filter(field => (
    Object.prototype.hasOwnProperty.call(updates, field)
    && normalizeEntryFieldValue(field, updates[field]) !== previousComparable[field]
  ));
  const serverChangedFields = ENTRY_EDITABLE_FIELDS.filter(field => currentComparable[field] !== previousComparable[field]);
  const conflictingFields = clientChangedFields.filter(field => (
    serverChangedFields.includes(field)
    && normalizeEntryFieldValue(field, updates[field]) !== currentComparable[field]
  ));

  if (conflictingFields.length) {
    return {
      type: 'conflict',
      entry: null,
      conflictingFields,
      clientChangedFields,
      serverChangedFields,
    };
  }

  const mergedComparable = { ...currentComparable };
  for (const field of clientChangedFields) {
    mergedComparable[field] = normalizeEntryFieldValue(field, updates[field]);
  }

  return {
    type: 'merged',
    entry: sanitizeEntry(mergedComparable, settings, { existingEntry: currentEntry, requireId: true }),
    conflictingFields: [],
    clientChangedFields,
    serverChangedFields,
  };
}

export function sanitizeEntry(input = {}, settings = DEFAULT_SETTINGS, { existingEntry = null, requireId = true } = {}) {
  const base = existingEntry ? {
    id: existingEntry.id,
    date: existingEntry.date,
    status: existingEntry.status,
    amTimeIn: existingEntry.amTimeIn,
    amTimeOut: existingEntry.amTimeOut,
    pmTimeIn: existingEntry.pmTimeIn,
    pmTimeOut: existingEntry.pmTimeOut,
    remarks: existingEntry.remarks,
    activities: existingEntry.activities,
    createdAt: existingEntry.createdAt,
  } : {};

  const merged = { ...base, ...input };
  const id = normalizeText(merged.id);
  if (requireId && !id) {
    throw new Error('Entry id is required');
  }

  const date = assertDate(merged.date, 'Entry date');
  const rawAmTimeIn = normalizeTime(merged.amTimeIn, 'AM Time In');
  const rawAmTimeOut = normalizeTime(merged.amTimeOut, 'AM Time Out');
  const rawPmTimeIn = normalizeTime(merged.pmTimeIn, 'PM Time In');
  const rawPmTimeOut = normalizeTime(merged.pmTimeOut, 'PM Time Out');
  const hasAnyTime = Boolean(rawAmTimeIn || rawAmTimeOut || rawPmTimeIn || rawPmTimeOut);
  const status = normalizeStatus(merged.status, hasAnyTime ? 'present' : 'absent');
  const amTimeIn = isPresentStatus(status) ? rawAmTimeIn : '';
  const amTimeOut = isPresentStatus(status) ? rawAmTimeOut : '';
  const pmTimeIn = isPresentStatus(status) ? rawPmTimeIn : '';
  const pmTimeOut = isPresentStatus(status) ? rawPmTimeOut : '';

  if (isPresentStatus(status) && !amTimeIn && !pmTimeIn) {
    throw new Error('At least one time in is required');
  }
  if (amTimeIn && amTimeOut && parseTime(amTimeIn) >= parseTime(amTimeOut)) {
    throw new Error('AM Time Out must be after AM Time In');
  }
  if (pmTimeIn && pmTimeOut && parseTime(pmTimeIn) >= parseTime(pmTimeOut)) {
    throw new Error('PM Time Out must be after PM Time In');
  }

  const entry = {
    id,
    date,
    status,
    amTimeIn,
    amTimeOut,
    pmTimeIn,
    pmTimeOut,
    remarks: normalizeText(merged.remarks),
    activities: normalizeText(merged.activities),
    createdAt: merged.createdAt || new Date().toISOString(),
  };

  const effectiveSettings = normalizeSettings(settings);
  const schedule = getScheduledWorkWindow(date, effectiveSettings);
  const hoursRendered = isPresentStatus(status) ? calculateEntryHours(entry) : 0;

  return {
    ...entry,
    hoursRendered,
    overtimeHours: isPresentStatus(status) ? calculateOvertimeForDate(date, hoursRendered) : 0,
    lateMinutes: isPresentStatus(status) && amTimeIn ? calculateLate(amTimeIn, schedule.expectedTimeIn) : 0,
    undertimeMinutes: isPresentStatus(status) && pmTimeOut ? calculateUndertime(pmTimeOut, schedule.expectedTimeOut) : 0,
  };
}

function hasCompleteWorkedClockPair(entry = {}) {
  if (entry.amTimeIn && entry.amTimeOut) return true;
  if (entry.pmTimeIn && entry.pmTimeOut) return true;
  if (!entry.amTimeIn && !entry.amTimeOut && !entry.pmTimeIn && !entry.pmTimeOut) return true;
  return false;
}

function normalizeForecastEntry(entry = {}) {
  const status = normalizeStatus(
    entry?.status,
    (entry?.amTimeIn || entry?.pmTimeIn || entry?.hoursRendered) ? 'present' : 'absent'
  );
  const hoursRendered = Math.max(0, Number(entry?.hoursRendered) || 0);
  return {
    ...entry,
    date: entry?.date || '',
    status,
    hoursRendered,
    isCompleteWorkedDay: status === 'present' && hoursRendered > 0 && hasCompleteWorkedClockPair(entry),
    isIncompleteWorkedDay: status === 'present' && hoursRendered > 0 && !hasCompleteWorkedClockPair(entry),
  };
}

function averageHours(entries = []) {
  if (!entries.length) return 0;
  return entries.reduce((sum, entry) => sum + entry.hoursRendered, 0) / entries.length;
}

function weightedAverageHours(entries = []) {
  if (!entries.length) return 0;
  const lifetimeAvgPerDay = averageHours(entries);
  const recentAvgPerDay = averageHours(entries.slice(-RECENT_FORECAST_DAYS));
  return ((recentAvgPerDay * 2) + lifetimeAvgPerDay) / 3;
}

function buildStatusMap(entries = [], holidays = []) {
  const statusesByDate = new Map();

  entries.forEach(entry => {
    if (!entry?.date) return;
    statusesByDate.set(entry.date, normalizeForecastEntry(entry).status);
  });

  holidays.forEach(holiday => {
    if (!holiday?.date || statusesByDate.has(holiday.date)) return;
    const status = holiday.type === 'holiday'
      ? 'holiday'
      : holiday.type === 'vacation_leave'
        ? 'vacation'
        : 'leave';
    statusesByDate.set(holiday.date, status);
  });

  return statusesByDate;
}

function projectForecastScenario({ label, avgPerDay, remainingHours, today, statusesByDate }) {
  const safeAvg = Math.max(0, Number(avgPerDay) || 0);
  const workingDaysRemaining = safeAvg > 0 ? Math.ceil(remainingHours / safeAvg) : 0;
  const excludedDates = [];
  const cursor = new Date(`${today}T00:00:00`);
  let countedDays = 0;
  let guard = 0;

  while (countedDays < workingDaysRemaining && guard < MAX_FORECAST_DAYS) {
    guard += 1;
    cursor.setDate(cursor.getDate() + 1);
    const isoDate = toLocalDateString(cursor);
    const status = statusesByDate.get(isoDate) || '';

    if (!isScheduledWorkday(isoDate)) continue;
    if (isExcludedWorkdayStatus(status)) {
      excludedDates.push({ date: isoDate, status });
      continue;
    }
    countedDays += 1;
  }

  return {
    label,
    avgPerDay: safeAvg,
    workingDaysRemaining,
    neededAvgHoursPerDay: workingDaysRemaining > 0 ? remainingHours / workingDaysRemaining : 0,
    estimatedDate: workingDaysRemaining === 0 ? today : toLocalDateString(cursor),
    excludedDates,
  };
}

function getForecastConfidence({ completeCount, incompleteCount, lifetimeAvgPerDay, recentAvgPerDay }) {
  const confidenceReasons = [];
  let confidence = 'high';

  if (completeCount < 3) {
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
    confidenceReasons.push('Forecast is based on complete worked days with a stable recent trend.');
  }

  return { confidence, confidenceReasons };
}

function buildForecastSuggestions({ incompleteCount, lifetimeAvgPerDay, recentAvgPerDay, expectedScenario, excludedCount }) {
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

  if (expectedScenario.workingDaysRemaining > 0) {
    suggestions.push(`Keep about ${expectedScenario.neededAvgHoursPerDay.toFixed(1)}h per working day to hit the expected date.`);
  }

  return suggestions.length ? suggestions : ['Current records are enough for a stable completion estimate.'];
}

export function calculateCompletionForecast({ today, requiredHours, entries = [], holidays = [] } = {}) {
  const normalizedToday = assertDate(today || toLocalDateString(new Date()), 'Forecast date');
  const forecastEntries = entries.map(normalizeForecastEntry);
  const completeWorkedEntries = forecastEntries
    .filter(entry => entry.isCompleteWorkedDay)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const incompleteWorkedEntries = forecastEntries.filter(entry => entry.isIncompleteWorkedDay);

  if (!completeWorkedEntries.length) return null;

  const totalHours = forecastEntries
    .filter(entry => entry.status === 'present')
    .reduce((sum, entry) => sum + entry.hoursRendered, 0);
  const completeTotalHours = completeWorkedEntries.reduce((sum, entry) => sum + entry.hoursRendered, 0);
  const lifetimeAvgPerDay = averageHours(completeWorkedEntries);
  const recentAvgPerDay = averageHours(completeWorkedEntries.slice(-RECENT_FORECAST_DAYS));
  const weightedAvgPerDay = weightedAverageHours(completeWorkedEntries);
  const avgPerDay = weightedAvgPerDay;

  if (avgPerDay <= 0) return null;

  const remainingHours = Math.max(0, Number(requiredHours || 0) - totalHours);
  const statusesByDate = buildStatusMap(forecastEntries, holidays);

  if (remainingHours === 0) {
    const scenario = {
      label: 'Expected',
      avgPerDay,
      workingDaysRemaining: 0,
      neededAvgHoursPerDay: 0,
      estimatedDate: normalizedToday,
      excludedDates: [],
    };
    return {
      totalHours,
      completeTotalHours,
      lifetimeAvgPerDay,
      recentAvgPerDay,
      weightedAvgPerDay,
      avgPerDay,
      remainingHours,
      workingDaysRemaining: 0,
      neededAvgHoursPerDay: 0,
      estimatedDate: normalizedToday,
      excludedDates: [],
      confidence: completeWorkedEntries.length < 3 ? 'low' : 'high',
      confidenceReasons: completeWorkedEntries.length < 3
        ? [`Only ${completeWorkedEntries.length} complete worked day(s) available.`]
        : ['Required hours are complete.'],
      suggestions: ['Required OJT hours are complete.'],
      scenarios: {
        conservative: { ...scenario, label: 'Conservative' },
        expected: scenario,
        optimistic: { ...scenario, label: 'Optimistic' },
      },
    };
  }

  const conservativeAvgPerDay = Math.max(0.25, Math.min(lifetimeAvgPerDay, recentAvgPerDay, weightedAvgPerDay));
  const expectedAvgPerDay = weightedAvgPerDay;
  const optimisticAvgPerDay = Math.min(
    REALISTIC_MAX_HOURS_PER_DAY,
    Math.max(lifetimeAvgPerDay, recentAvgPerDay, weightedAvgPerDay)
  );

  const scenarios = {
    conservative: projectForecastScenario({
      label: 'Conservative',
      avgPerDay: conservativeAvgPerDay,
      remainingHours,
      today: normalizedToday,
      statusesByDate,
    }),
    expected: projectForecastScenario({
      label: 'Expected',
      avgPerDay: expectedAvgPerDay,
      remainingHours,
      today: normalizedToday,
      statusesByDate,
    }),
    optimistic: projectForecastScenario({
      label: 'Optimistic',
      avgPerDay: optimisticAvgPerDay,
      remainingHours,
      today: normalizedToday,
      statusesByDate,
    }),
  };

  const { confidence, confidenceReasons } = getForecastConfidence({
    completeCount: completeWorkedEntries.length,
    incompleteCount: incompleteWorkedEntries.length,
    lifetimeAvgPerDay,
    recentAvgPerDay,
  });
  const suggestions = buildForecastSuggestions({
    incompleteCount: incompleteWorkedEntries.length,
    lifetimeAvgPerDay,
    recentAvgPerDay,
    expectedScenario: scenarios.expected,
    excludedCount: scenarios.expected.excludedDates.length,
  });

  return {
    totalHours,
    completeTotalHours,
    lifetimeAvgPerDay,
    recentAvgPerDay,
    weightedAvgPerDay,
    avgPerDay: scenarios.expected.avgPerDay,
    remainingHours,
    workingDaysRemaining: scenarios.expected.workingDaysRemaining,
    neededAvgHoursPerDay: scenarios.expected.neededAvgHoursPerDay,
    estimatedDate: scenarios.expected.estimatedDate,
    excludedDates: scenarios.expected.excludedDates,
    confidence,
    confidenceReasons,
    suggestions,
    scenarios,
  };
}

export function sanitizeImportPayload(payload = {}) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Import payload must be an object');
  }

  const settings = normalizeSettings(payload.settings || {});
  const profile = normalizeProfile(payload.profile || {});
  const theme = payload.theme === 'light' ? 'light' : 'dark';
  const entries = [];
  const holidays = [];
  const entryIds = new Set();
  const holidayDates = new Set();

  if (payload.entries != null && !Array.isArray(payload.entries)) {
    throw new Error('Entries must be an array');
  }
  if (payload.holidays != null && !Array.isArray(payload.holidays)) {
    throw new Error('Holidays must be an array');
  }

  for (const rawEntry of payload.entries || []) {
    const entry = sanitizeEntry(rawEntry, settings, { requireId: true });
    if (entryIds.has(entry.id)) {
      throw new Error(`Duplicate entry id: ${entry.id}`);
    }
    entryIds.add(entry.id);
    entries.push(entry);
  }

  for (const rawHoliday of payload.holidays || []) {
    const holiday = sanitizeHoliday(rawHoliday);
    if (holidayDates.has(holiday.date)) {
      throw new Error(`Duplicate holiday date: ${holiday.date}`);
    }
    holidayDates.add(holiday.date);
    holidays.push(holiday);
  }

  return { entries, holidays, profile, settings, theme };
}

export function buildImportPreview(nextState, currentState = {}) {
  const currentEntries = Array.isArray(currentState.entries) ? currentState.entries : [];
  const currentHolidays = Array.isArray(currentState.holidays) ? currentState.holidays : [];
  const currentConfig = getComparableConfig({
    profile: currentState.profile || {},
    settings: currentState.settings || {},
    theme: currentState.theme || 'dark',
  });
  const nextConfig = getComparableConfig(nextState);

  const currentEntriesById = new Map(currentEntries.map(entry => [entry.id, getComparableEntry(entry)]));
  const nextEntriesById = new Map(nextState.entries.map(entry => [entry.id, getComparableEntry(entry)]));
  const currentHolidayByDate = new Map(currentHolidays.map(holiday => [holiday.date, getComparableHoliday(holiday)]));
  const nextHolidayByDate = new Map(nextState.holidays.map(holiday => [holiday.date, getComparableHoliday(holiday)]));

  let entriesAdded = 0;
  let entriesRemoved = 0;
  let entriesChanged = 0;
  let holidaysAdded = 0;
  let holidaysRemoved = 0;
  let holidaysChanged = 0;

  for (const [id, entry] of nextEntriesById) {
    if (!currentEntriesById.has(id)) entriesAdded++;
    else if (JSON.stringify(entry) !== JSON.stringify(currentEntriesById.get(id))) entriesChanged++;
  }
  for (const id of currentEntriesById.keys()) {
    if (!nextEntriesById.has(id)) entriesRemoved++;
  }

  for (const [date, holiday] of nextHolidayByDate) {
    if (!currentHolidayByDate.has(date)) holidaysAdded++;
    else if (JSON.stringify(holiday) !== JSON.stringify(currentHolidayByDate.get(date))) holidaysChanged++;
  }
  for (const date of currentHolidayByDate.keys()) {
    if (!nextHolidayByDate.has(date)) holidaysRemoved++;
  }

  const changedProfileFields = Object.keys(nextConfig.profile).filter(key => nextConfig.profile[key] !== currentConfig.profile[key]);
  const changedSettingFields = Object.keys(nextConfig.settings).filter(key => JSON.stringify(nextConfig.settings[key]) !== JSON.stringify(currentConfig.settings[key]));

  const nextEntryDates = nextState.entries.map(entry => entry.date).sort();

  return {
    current: {
      entries: currentEntries.length,
      holidays: currentHolidays.length,
      theme: currentConfig.theme,
      profileName: currentConfig.profile.name || '',
    },
    incoming: {
      entries: nextState.entries.length,
      holidays: nextState.holidays.length,
      theme: nextConfig.theme,
      profileName: nextConfig.profile.name || '',
      startDate: nextEntryDates[0] || null,
      endDate: nextEntryDates[nextEntryDates.length - 1] || null,
    },
    diff: {
      entriesAdded,
      entriesRemoved,
      entriesChanged,
      holidaysAdded,
      holidaysRemoved,
      holidaysChanged,
      themeChanged: currentConfig.theme !== nextConfig.theme,
      changedProfileFields,
      changedSettingFields,
    },
  };
}
