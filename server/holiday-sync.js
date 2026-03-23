const PH_COUNTRY_CODE = 'PH';
const HOLIDAY_API_BASE = 'https://date.nager.at/api/v3';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const holidayCache = new Map();
const syncLocks = new Map();

function normalizeHolidayName(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeHolidayNameKey(value) {
  return normalizeHolidayName(value).toLowerCase();
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getYearBounds(years) {
  const orderedYears = [...years].sort((a, b) => a - b);
  return {
    from: `${orderedYears[0]}-01-01`,
    to: `${orderedYears[orderedYears.length - 1]}-12-31`,
  };
}

export function extractPhilippinePublicHolidays(payload) {
  if (!Array.isArray(payload)) return [];

  return payload
    .filter(item => isIsoDate(item?.date))
    .map(item => ({
      date: item.date,
      name: normalizeHolidayName(item.localName) || normalizeHolidayName(item.name) || 'Public Holiday',
      type: 'holiday',
      source: 'public_api',
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildHolidaySyncPlan(existingHolidays, incomingPublicHolidays) {
  const existing = Array.isArray(existingHolidays) ? existingHolidays : [];
  const incoming = Array.isArray(incomingPublicHolidays) ? incomingPublicHolidays : [];

  const existingByDate = new Map(existing.map(holiday => [holiday.date, holiday]));
  const incomingByDate = new Map(incoming.map(holiday => [holiday.date, holiday]));
  const toInsert = [];
  const toUpdate = [];
  const toDelete = [];

  for (const holiday of incoming) {
    const current = existingByDate.get(holiday.date);
    if (!current) {
      toInsert.push(holiday);
      continue;
    }

    const currentSource = current.source || 'manual';
    if (currentSource !== 'public_api') continue;

    if (current.name !== holiday.name || current.type !== holiday.type || currentSource !== holiday.source) {
      toUpdate.push({
        date: holiday.date,
        update: holiday,
      });
    }
  }

  for (const holiday of existing) {
    const currentSource = holiday.source || 'manual';
    if (currentSource !== 'public_api') continue;
    if (!incomingByDate.has(holiday.date)) {
      toDelete.push(holiday.date);
    }
  }

  return { toInsert, toUpdate, toDelete };
}

export function buildHolidaySourceBackfillPlan(existingHolidays, incomingPublicHolidays) {
  const existing = Array.isArray(existingHolidays) ? existingHolidays : [];
  const incoming = Array.isArray(incomingPublicHolidays) ? incomingPublicHolidays : [];
  const incomingByDate = new Map(incoming.map(holiday => [holiday.date, holiday]));

  return existing
    .filter(holiday => {
      const source = holiday.source || '';
      if (source) return false;
      if (holiday.type !== 'holiday') return false;

      const incomingHoliday = incomingByDate.get(holiday.date);
      if (!incomingHoliday) return false;

      const existingName = normalizeHolidayNameKey(holiday.name);
      const incomingName = normalizeHolidayNameKey(incomingHoliday.name);
      return existingName && existingName === incomingName;
    })
    .map(holiday => holiday.date);
}

async function fetchPublicHolidayYear(year) {
  const response = await fetch(`${HOLIDAY_API_BASE}/PublicHolidays/${year}/${PH_COUNTRY_CODE}`);
  if (!response.ok) {
    throw new Error(`Holiday API request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return extractPhilippinePublicHolidays(payload);
}

export async function getPhilippinePublicHolidaysForYear(year) {
  const normalizedYear = Number.parseInt(year, 10);
  if (!Number.isInteger(normalizedYear) || normalizedYear < 1900 || normalizedYear > 2100) {
    throw new Error('Holiday sync year is invalid');
  }

  const now = Date.now();
  const cached = holidayCache.get(normalizedYear);
  if (cached && (now - cached.ts) < CACHE_TTL_MS) {
    return cached.value;
  }

  const holidays = await fetchPublicHolidayYear(normalizedYear);
  holidayCache.set(normalizedYear, { ts: now, value: holidays });
  return holidays;
}

export async function syncPhilippinePublicHolidays({
  userId,
  years,
  HolidayModel,
}) {
  if (!userId) throw new Error('Holiday sync userId is required');
  if (!HolidayModel) throw new Error('Holiday sync model is required');

  const normalizedYears = [...new Set((Array.isArray(years) ? years : [])
    .map(year => Number.parseInt(year, 10))
    .filter(year => Number.isInteger(year) && year >= 1900 && year <= 2100))]
    .sort((a, b) => a - b);

  if (!normalizedYears.length) {
    return { inserted: 0, updated: 0, deleted: 0, years: [] };
  }

  const lockKey = userId;
  const currentLock = syncLocks.get(lockKey) || Promise.resolve();
  const nextLock = currentLock.then(async () => {
    const fetchedByYear = await Promise.all(
      normalizedYears.map(async year => getPhilippinePublicHolidaysForYear(year))
    );
    const incoming = fetchedByYear.flatMap(items => items);
    const { from, to } = getYearBounds(normalizedYears);

    const existing = await HolidayModel
      .find({
        userId,
        date: { $gte: from, $lte: to },
      })
      .lean();

    const backfillDates = buildHolidaySourceBackfillPlan(existing, incoming);
    if (backfillDates.length) {
      await HolidayModel.updateMany(
        {
          userId,
          date: { $in: backfillDates },
          type: 'holiday',
          $or: [
            { source: { $exists: false } },
            { source: null },
            { source: '' },
          ],
        },
        { $set: { source: 'public_api' } }
      );
    }

    const existingAfterBackfill = await HolidayModel
      .find({
        userId,
        date: { $gte: from, $lte: to },
      })
      .lean();

    const plan = buildHolidaySyncPlan(existingAfterBackfill, incoming);

    if (plan.toInsert.length) {
      await HolidayModel.insertMany(plan.toInsert.map(holiday => ({ ...holiday, userId })));
    }

    if (plan.toUpdate.length) {
      await Promise.all(
        plan.toUpdate.map(item => HolidayModel.updateOne(
          { userId, date: item.date, source: 'public_api' },
          { $set: item.update }
        ))
      );
    }

    if (plan.toDelete.length) {
      await HolidayModel.deleteMany({
        userId,
        source: 'public_api',
        date: { $in: plan.toDelete },
      });
    }

    return {
      backfilled: backfillDates.length,
      inserted: plan.toInsert.length,
      updated: plan.toUpdate.length,
      deleted: plan.toDelete.length,
      years: normalizedYears,
    };
  });

  const releaseLock = nextLock.catch(() => {});
  syncLocks.set(lockKey, releaseLock);
  try {
    return await nextLock;
  } finally {
    if (syncLocks.get(lockKey) === releaseLock) {
      syncLocks.delete(lockKey);
    }
  }
}
