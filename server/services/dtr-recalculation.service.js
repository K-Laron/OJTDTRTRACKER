import { DEFAULT_SETTINGS, normalizeSettings, sanitizeEntry } from '../tracker-core.js';

const DERIVED_ENTRY_FIELDS = ['hoursRendered', 'overtimeHours', 'lateMinutes', 'undertimeMinutes'];

function roundHours(value) {
  return Math.round((Number(value) || 0) * 1e6) / 1e6;
}

function valuesEqual(field, currentValue, nextValue) {
  if (field.endsWith('Minutes')) {
    return Number.parseInt(currentValue, 10) === Number.parseInt(nextValue, 10);
  }
  return roundHours(currentValue) === roundHours(nextValue);
}

function toPlainEntry(entry = {}) {
  const { _id, __v, ...rest } = entry.toObject ? entry.toObject() : entry;
  return rest;
}

// Rows stored before the four-day week or the historical split schedule were
// derived against different rules. Recomputing them through sanitizeEntry
// reports exactly what would change, and nothing else.
export function getEntryRecalculationChange(entry = {}, settings = DEFAULT_SETTINGS) {
  const current = toPlainEntry(entry);
  const next = sanitizeEntry(current, normalizeSettings(settings), {
    existingEntry: current,
    requireId: true,
  });

  const before = {};
  const after = {};
  DERIVED_ENTRY_FIELDS.forEach(field => {
    if (valuesEqual(field, current[field], next[field])) return;
    before[field] = current[field] ?? 0;
    after[field] = next[field] ?? 0;
  });

  if (!Object.keys(after).length) return null;

  return { id: current.id, userId: current.userId, date: current.date, before, after, backup: current };
}

// settingsByUserId maps a user to their settings. Users without a config fall
// back to DEFAULT_SETTINGS, matching server-side sanitizeEntry.
export function buildEntryRecalculationPlan(entries = [], settingsByUserId = new Map()) {
  const changes = [];

  entries.forEach(entry => {
    const userId = entry?.userId || '';
    const change = getEntryRecalculationChange(entry, settingsByUserId.get(userId) || DEFAULT_SETTINGS);
    if (change) changes.push(change);
  });

  return { scanned: entries.length, changed: changes.length, changes };
}