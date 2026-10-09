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
  entries.forEach(entry => {
    if (!entry?.date) return;
    const current = byDate.get(entry.date);
    if (!current || entrySortTime(entry) >= entrySortTime(current)) byDate.set(entry.date, entry);
  });
  return [...byDate.values()];
}

// Replaces every entry on the same date, so adding a record for a date that
// already has one cannot create a second row.
export function upsertEntryForDate(entries = [], entry) {
  const kept = entries.filter(item => item?.date !== entry?.date);
  return entry ? [...kept, entry] : kept;
}