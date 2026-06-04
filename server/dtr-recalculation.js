import { DEFAULT_SETTINGS, normalizeSettings, sanitizeEntry } from './tracker-core.js';

const DERIVED_ENTRY_FIELDS = ['hoursRendered', 'overtimeHours', 'lateMinutes', 'undertimeMinutes'];

function normalizeNumber(value) {
  return Math.round((Number(value) || 0) * 1000000) / 1000000;
}

function valuesEqual(field, currentValue, nextValue) {
  if (field.endsWith('Minutes')) {
    return Number.parseInt(currentValue, 10) === Number.parseInt(nextValue, 10);
  }
  return normalizeNumber(currentValue) === normalizeNumber(nextValue);
}

function cleanEntry(entry = {}) {
  const plain = entry.toObject ? entry.toObject() : { ...entry };
  const { _id, __v, ...rest } = plain;
  return rest;
}

export function getEntryRecalculationChange(entry = {}, settings = DEFAULT_SETTINGS) {
  const current = cleanEntry(entry);
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

  return {
    id: current.id,
    userId: current.userId,
    date: current.date,
    before,
    after,
    backup: current,
  };
}

export function buildEntryRecalculationPlan(entries = [], settingsByUserId = new Map()) {
  const changes = [];

  entries.forEach(entry => {
    const userId = entry?.userId || '';
    const settings = settingsByUserId.get(userId) || DEFAULT_SETTINGS;
    const change = getEntryRecalculationChange(entry, settings);
    if (change) changes.push(change);
  });

  return {
    scanned: entries.length,
    changed: changes.length,
    changes,
  };
}
