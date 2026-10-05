import { Config, Holiday } from '../models.js';
import { sanitizeHoliday } from '../tracker-core.js';
import { syncPhilippinePublicHolidays } from '../holiday-sync.js';
import { withOptionalTransaction } from '../db.js';
import { notifyClients } from '../sync-hub.js';
import { writeAuditEvent } from './audit.service.js';
import { cleanHolidayForAudit } from './snapshots.js';

function getHolidaySyncYears(config) {
  const currentYear = new Date().getFullYear();
  const startYear = Number.parseInt(config?.profile?.startDate?.slice(0, 4), 10);
  const earliestYear = Number.isInteger(startYear) ? Math.min(startYear, currentYear) : currentYear;
  const years = [];

  for (let year = earliestYear; year <= currentYear + 1; year += 1) {
    years.push(year);
  }

  return years;
}

function getRequestedHolidaySyncYears(query = {}, config) {
  const requestedYears = [
    query.year,
    ...(Array.isArray(query.years)
      ? query.years
      : typeof query.years === 'string'
        ? query.years.split(',')
        : []),
  ]
    .flatMap(value => (Array.isArray(value) ? value : [value]))
    .map(value => Number.parseInt(String(value).trim(), 10))
    .filter(year => Number.isInteger(year) && year >= 1900 && year <= 2100);

  const fallbackYears = getHolidaySyncYears(config);
  return [...new Set([...(requestedYears.length ? requestedYears : []), ...fallbackYears])].sort((a, b) => a - b);
}

export async function listHolidays(userId, query = {}) {
  const [config, existingHolidays] = await Promise.all([
    Config.findOne({ userId }).lean(),
    Holiday.find({ userId }).sort({ date: 1 }).lean(),
  ]);

  let holidays = existingHolidays;
  try {
    const syncResult = await syncPhilippinePublicHolidays({
      userId,
      years: getRequestedHolidaySyncYears(query, config),
      HolidayModel: Holiday,
      existingHolidays,
    });
    if (syncResult.changed) {
      holidays = await Holiday.find({ userId }).sort({ date: 1 }).lean();
    }
  } catch (syncErr) {
    console.error('Philippine holiday sync error:', syncErr);
  }

  return holidays;
}

export async function createHoliday(userId, body = {}) {
  const { result } = await withOptionalTransaction(async (session) => {
    const sanitizedHoliday = sanitizeHoliday(body);
    const existingQuery = Holiday.findOne({ userId, date: sanitizedHoliday.date });
    if (session) existingQuery.session(session);
    const existingHoliday = await existingQuery;
    if (existingHoliday) {
      return { status: 400, body: { error: 'A holiday or leave already exists for this date' } };
    }

    const [holiday] = await Holiday.create([{ ...sanitizedHoliday, userId }], session ? { session } : undefined);
    await writeAuditEvent({
      userId,
      entity: 'holiday',
      action: 'create',
      after: cleanHolidayForAudit(holiday.toObject()),
    }, session);
    return { status: 200, body: holiday.toObject() };
  });

  if (result.status === 200) {
    notifyClients(userId, ['holidays']);
  }
  return result;
}

export async function updateHoliday(userId, date, body = {}) {
  const { result } = await withOptionalTransaction(async (session) => {
    const sanitizedHoliday = sanitizeHoliday({ ...body, date });
    const existingQuery = Holiday.findOne({ userId, date });
    if (session) existingQuery.session(session);
    const existingHoliday = await existingQuery;
    const holiday = await Holiday.findOneAndUpdate(
      { userId, date },
      { ...sanitizedHoliday, userId },
      { returnDocument: 'after', upsert: true, session: session || undefined }
    );
    await writeAuditEvent({
      userId,
      entity: 'holiday',
      action: existingHoliday ? 'update' : 'create',
      before: cleanHolidayForAudit(existingHoliday?.toObject()),
      after: cleanHolidayForAudit(holiday.toObject()),
    }, session);
    return { status: 200, body: holiday.toObject() };
  });

  if (result.status === 200) {
    notifyClients(userId, ['holidays']);
  }
  return result;
}

export async function deleteHoliday(userId, date) {
  const { result } = await withOptionalTransaction(async (session) => {
    const holiday = await Holiday.findOneAndDelete(
      { date, userId },
      { session: session || undefined }
    );
    if (!holiday) return { status: 404, body: { error: 'Holiday not found' } };
    await writeAuditEvent({
      userId,
      entity: 'holiday',
      action: 'delete',
      before: cleanHolidayForAudit(holiday.toObject()),
    }, session);
    return { status: 200, body: { success: true } };
  });

  if (result.status === 200) {
    notifyClients(userId, ['holidays']);
  }
  return result;
}
