import { store } from '../store.js';

const lastRefreshByUserYear = new Map();
const REFRESH_TTL_MS = 24 * 60 * 60 * 1000;

export async function ensureYearHolidays(year, { force = false, logTag = 'Calendar' } = {}) {
  if (!store.userId) return;
  const key = `${store.userId}:${year}`;
  if (!force) {
    force = Date.now() - (lastRefreshByUserYear.get(key) || 0) >= REFRESH_TTL_MS;
  }
  try {
    const holidays = await store.refreshHolidays([year], { force });
    // Stamp only forced fetches. Skipped refreshes return cached data and
    // must not slide the window, or a long-lived tab never revalidates.
    if (force && Array.isArray(holidays)) lastRefreshByUserYear.set(key, Date.now());
  } catch (err) {
    console.error(`[${logTag}] Failed to refresh holidays for visible year:`, err);
  }
}
