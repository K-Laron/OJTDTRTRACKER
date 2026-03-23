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
const TIME_RE = /^\d{2}:\d{2}$/;
const HOLIDAY_TYPES = new Set(['holiday', 'sick_leave', 'vacation_leave']);
const HOLIDAY_SOURCES = new Set(['manual', 'public_api']);
const ENTRY_EDITABLE_FIELDS = ['date', 'amTimeIn', 'amTimeOut', 'pmTimeIn', 'pmTimeOut', 'remarks', 'activities'];

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function parseTime(value) {
  if (!value) return null;
  if (!TIME_RE.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

export function calculateHours(timeIn, timeOut, breakMins = 0) {
  const start = parseTime(timeIn);
  const end = parseTime(timeOut);
  if (start == null || end == null) return 0;
  return Math.max(0, (end - start - breakMins) / 60);
}

export function calculateEntryHours(entry) {
  let total = 0;
  if (entry.amTimeIn && entry.amTimeOut) total += calculateHours(entry.amTimeIn, entry.amTimeOut);
  if (entry.pmTimeIn && entry.pmTimeOut) total += calculateHours(entry.pmTimeIn, entry.pmTimeOut);
  return total;
}

export function calculateOvertime(hours, threshold = 8) {
  return Math.max(0, hours - threshold);
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
  const amTimeIn = normalizeTime(merged.amTimeIn, 'AM Time In');
  const amTimeOut = normalizeTime(merged.amTimeOut, 'AM Time Out');
  const pmTimeIn = normalizeTime(merged.pmTimeIn, 'PM Time In');
  const pmTimeOut = normalizeTime(merged.pmTimeOut, 'PM Time Out');

  if (!amTimeIn && !pmTimeIn) {
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
    amTimeIn,
    amTimeOut,
    pmTimeIn,
    pmTimeOut,
    remarks: normalizeText(merged.remarks),
    activities: normalizeText(merged.activities),
    createdAt: merged.createdAt || new Date().toISOString(),
  };

  const effectiveSettings = normalizeSettings(settings);
  const hoursRendered = calculateEntryHours(entry);

  return {
    ...entry,
    hoursRendered,
    overtimeHours: calculateOvertime(hoursRendered),
    lateMinutes: amTimeIn ? calculateLate(amTimeIn, effectiveSettings.expectedTimeIn) : 0,
    undertimeMinutes: pmTimeOut ? calculateUndertime(pmTimeOut, effectiveSettings.expectedTimeOut) : 0,
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
