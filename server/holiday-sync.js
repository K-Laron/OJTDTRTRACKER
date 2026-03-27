const PH_COUNTRY_CODE = 'PH';
const HOLIDAY_API_BASE = 'https://date.nager.at/api/v3';
const SUCCESS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_RETRY_TTL_MS = 60 * 60 * 1000;

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

function buildYearFilters(years) {
  return [...years]
    .map(year => Number.parseInt(year, 10))
    .filter(year => Number.isInteger(year) && year >= 1900 && year <= 2100)
    .sort((a, b) => a - b)
    .map(year => ({
      year,
      from: `${year}-01-01`,
      to: `${year}-12-31`,
    }));
}

function filterHolidaysByYears(holidays, years) {
  const yearFilters = buildYearFilters(years);
  if (!yearFilters.length) return [];

  return (Array.isArray(holidays) ? holidays : [])
    .filter(holiday => (
      typeof holiday?.date === 'string'
      && yearFilters.some(({ from, to }) => holiday.date >= from && holiday.date <= to)
    ));
}

function applyBackfilledSources(existingHolidays, backfillDates) {
  if (!backfillDates.length) return existingHolidays;
  const backfillDateSet = new Set(backfillDates);
  return existingHolidays.map(holiday => (
    backfillDateSet.has(holiday.date)
      ? { ...holiday, source: 'public_api' }
      : holiday
  ));
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

function validateHolidayYear(year) {
  const normalizedYear = Number.parseInt(year, 10);
  if (!Number.isInteger(normalizedYear) || normalizedYear < 1900 || normalizedYear > 2100) {
    throw new Error('Holiday sync year is invalid');
  }
  return normalizedYear;
}

async function getHolidayYearFetchResult(year) {
  const normalizedYear = validateHolidayYear(year);

  const now = Date.now();
  const cached = holidayCache.get(normalizedYear);
  if (cached?.status === 'success' && (now - cached.ts) < SUCCESS_CACHE_TTL_MS) {
    return { year: normalizedYear, holidays: cached.value, failed: false };
  }

  if (cached?.status === 'failure' && (now - cached.ts) < FAILURE_RETRY_TTL_MS) {
    return { year: normalizedYear, holidays: cached.value || null, failed: !Array.isArray(cached.value) };
  }

  try {
    const holidays = await fetchPublicHolidayYear(normalizedYear);
    holidayCache.set(normalizedYear, { status: 'success', ts: now, value: holidays });
    return { year: normalizedYear, holidays, failed: false };
  } catch (error) {
    const staleHolidays = Array.isArray(cached?.value) ? cached.value : null;
    holidayCache.set(normalizedYear, {
      status: 'failure',
      ts: now,
      value: staleHolidays,
      error,
    });
    return { year: normalizedYear, holidays: staleHolidays, failed: !Array.isArray(staleHolidays) };
  }
}

export async function getPhilippinePublicHolidaysForYear(year) {
  const result = await getHolidayYearFetchResult(year);
  if (result.failed) {
    const cached = holidayCache.get(result.year);
    throw cached?.error || new Error('Holiday API request failed');
  }
  return result.holidays;
}

export async function syncPhilippinePublicHolidays({
  userId,
  years,
  HolidayModel,
  existingHolidays = null,
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
      normalizedYears.map(async year => getHolidayYearFetchResult(year))
    );
    const syncableYears = fetchedByYear
      .filter(result => Array.isArray(result.holidays))
      .map(result => result.year);

    if (!syncableYears.length) {
      return {
        backfilled: 0,
        inserted: 0,
        updated: 0,
        deleted: 0,
        years: normalizedYears,
        changed: false,
      };
    }

    const incoming = fetchedByYear.flatMap(result => result.holidays || []);
    const yearFilters = buildYearFilters(syncableYears);

    const existing = Array.isArray(existingHolidays)
      ? filterHolidaysByYears(existingHolidays, syncableYears)
      : await HolidayModel
        .find({
          userId,
          $or: yearFilters.map(({ from, to }) => ({
            date: { $gte: from, $lte: to },
          })),
        })
        .lean();

    const backfillDates = buildHolidaySourceBackfillPlan(existing, incoming);
    const existingAfterBackfill = applyBackfilledSources(existing, backfillDates);

    const plan = buildHolidaySyncPlan(existingAfterBackfill, incoming);

    const bulkOps = [];
    if (backfillDates.length) {
      bulkOps.push({
        updateMany: {
          filter: {
            userId,
            date: { $in: backfillDates },
            type: 'holiday',
            $or: [
              { source: { $exists: false } },
              { source: null },
              { source: '' },
            ],
          },
          update: { $set: { source: 'public_api' } },
        },
      });
    }

    bulkOps.push(...plan.toInsert.map(holiday => ({
      insertOne: {
        document: { ...holiday, userId },
      },
    })));

    bulkOps.push(...plan.toUpdate.map(item => ({
      updateOne: {
        filter: { userId, date: item.date, source: 'public_api' },
        update: { $set: item.update },
      },
    })));

    if (plan.toDelete.length) {
      bulkOps.push({
        deleteMany: {
          filter: {
            userId,
            source: 'public_api',
            date: { $in: plan.toDelete },
          },
        },
      });
    }

    if (bulkOps.length) {
      await HolidayModel.bulkWrite(bulkOps, { ordered: false });
    }

    return {
      backfilled: backfillDates.length,
      inserted: plan.toInsert.length,
      updated: plan.toUpdate.length,
      deleted: plan.toDelete.length,
      years: normalizedYears,
      changed: bulkOps.length > 0,
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
