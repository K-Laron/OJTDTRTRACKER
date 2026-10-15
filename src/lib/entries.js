// A user has at most one entry per date. Entries are keyed by a client-generated
// id, so a legacy row or a second device can still leave two rows on one date.
// Every summary in the store assumes the invariant, so it is enforced here at
// the write boundary instead of being filtered by each reader.

function entrySortTime(entry = {}) {
  const createdAt = Date.parse(entry.createdAt || '');
  if (Number.isFinite(createdAt)) return createdAt;
  const updatedAt = Date.parse(entry.updatedAt || '');
  if (Number.isFinite(updatedAt)) return updatedAt;
  return 0;
}

// Keeps the most recently created entry for each date. Rows without a usable
// timestamp fall back to array order, so the last one read wins.
export function collapseEntriesByDate(entries = []) {
  const byDate = new Map();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const date = entry?.date;
    if (!date) continue;
    const current = byDate.get(date);
    if (!current) {
      byDate.set(date, [entry, entrySortTime(entry)]);
    } else {
      const sortTime = entrySortTime(entry);
      if (sortTime >= current[1]) {
        current[0] = entry;
        current[1] = sortTime;
      }
    }
  }
  const result = [];
  for (const pair of byDate.values()) {
    result.push(pair[0]);
  }
  return result;
}

// Replaces every entry on the same date, so adding a record for a date that
// already has one cannot create a second row.
export function upsertEntryForDate(entries = [], entry) {
  const kept = entries.filter(item => item?.date !== entry?.date);
  return entry ? [...kept, entry] : kept;
}
import { getScheduledNonWorkingStatus } from '../../shared/work-schedule.js';

export const ENTRY_STATUSES = new Set(['present', 'leave', 'vacation', 'holiday', 'no_ojt', 'absent']);
export const NON_WORKING_STATUSES = new Set(['leave', 'vacation', 'holiday', 'no_ojt', 'absent']);

export function normalizeEntryStatus(entry = {}) {
  const normalized = String(entry.status || '').trim().toLowerCase();
  const scheduledNonWorkingStatus = getScheduledNonWorkingStatus(entry.date || '');
  if (ENTRY_STATUSES.has(normalized)) {
    if (normalized === 'absent' && scheduledNonWorkingStatus) return scheduledNonWorkingStatus;
    return normalized;
  }
  if (entry.amTimeIn || entry.amTimeOut || entry.pmTimeIn || entry.pmTimeOut || Number(entry.hoursRendered) > 0) {
    return 'present';
  }
  if (scheduledNonWorkingStatus) return scheduledNonWorkingStatus;
  return 'absent';
}

export function formatStatusLabel(status) {
  return String(status || 'absent')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}
