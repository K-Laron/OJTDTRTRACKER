import { Config, Entry, Holiday } from '../models.js';
import {
  DEFAULT_SETTINGS,
  normalizeProfile,
  normalizeSettings,
} from '../tracker-core.js';

export function cleanEntryForAudit(entry) {
  if (!entry) return null;
  const { _id, __v, userId, ...rest } = entry;
  return rest;
}

export function cleanHolidayForAudit(holiday) {
  if (!holiday) return null;
  const { _id, __v, userId, ...rest } = holiday;
  return rest;
}

export function cleanConfigForAudit(config) {
  if (!config) {
    return {
      profile: normalizeProfile({}),
      settings: normalizeSettings(DEFAULT_SETTINGS),
      theme: 'dark',
    };
  }
  return {
    profile: normalizeProfile(config.profile || {}),
    settings: normalizeSettings(config.settings || DEFAULT_SETTINGS),
    theme: config.theme === 'light' ? 'light' : 'dark',
  };
}

export async function getUserStateSnapshot(userId, session = null) {
  const entriesQuery = Entry.find({ userId });
  const holidaysQuery = Holiday.find({ userId });
  const configQuery = Config.findOne({ userId });
  if (session) {
    entriesQuery.session(session);
    holidaysQuery.session(session);
    configQuery.session(session);
  }

  const [entries, holidays, config] = await Promise.all([
    entriesQuery.lean(),
    holidaysQuery.lean(),
    configQuery.lean(),
  ]);

  return {
    entries: entries.map(cleanEntryForAudit),
    holidays: holidays.map(cleanHolidayForAudit),
    ...cleanConfigForAudit(config),
  };
}
