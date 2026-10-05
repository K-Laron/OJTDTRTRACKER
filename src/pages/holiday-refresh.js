import { store } from '../store.js';

export async function ensureYearHolidays(year, { force = false, logTag = 'Calendar' } = {}) {
  if (!store.userId) return;
  try {
    const holidays = await store.refreshHolidays([year], { force });
    if (!Array.isArray(holidays)) return;
  } catch (err) {
    console.error(`[${logTag}] Failed to refresh holidays for visible year:`, err);
  }
}
