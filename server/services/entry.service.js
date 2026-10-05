import { Config, Entry } from '../models.js';
import {
  DEFAULT_SETTINGS,
  entriesConflict,
  normalizeSettings,
  resolveEntryUpdate,
  sanitizeEntry,
} from '../tracker-core.js';
import { withOptionalTransaction } from '../db.js';
import { notifyClients } from '../sync-hub.js';
import { writeAuditEvent } from './audit.service.js';

function cleanEntryForAudit(entry) {
  if (!entry) return null;
  const { _id, __v, userId, ...rest } = entry;
  return rest;
}

async function getUserSettings(userId, session = null) {
  const query = Config.findOne({ userId });
  if (session) query.session(session);
  const config = await query.lean();
  return normalizeSettings(config?.settings || DEFAULT_SETTINGS);
}

function toConflictResponse(current, resolution) {
  return {
    error: 'Entry changed elsewhere',
    current,
    conflicts: resolution.conflictingFields,
    clientChangedFields: resolution.clientChangedFields,
    serverChangedFields: resolution.serverChangedFields,
  };
}

export async function listEntries(userId, { dateFrom = '', dateTo = '', page, limit } = {}) {
  const query = { userId };
  if (dateFrom || dateTo) {
    query.date = {};
    if (dateFrom) query.date.$gte = dateFrom;
    if (dateTo) query.date.$lte = dateTo;
  }

  const entryQuery = Entry.find(query).sort({ date: -1 }).lean();
  if (Number.isFinite(page) || Number.isFinite(limit)) {
    const safePage = Math.max(1, Number.isFinite(page) ? page : 1);
    const safeLimit = Math.min(500, Math.max(1, Number.isFinite(limit) ? limit : 50));
    const [items, total] = await Promise.all([
      entryQuery.skip((safePage - 1) * safeLimit).limit(safeLimit),
      Entry.countDocuments(query),
    ]);
    return {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      hasMore: safePage * safeLimit < total,
    };
  }

  return entryQuery;
}

export async function createEntry(userId, body) {
  const { result: entry } = await withOptionalTransaction(async (session) => {
    const settings = await getUserSettings(userId, session);
    const sanitizedEntry = sanitizeEntry(body, settings, { requireId: true });
    const [createdEntry] = await Entry.create([{ ...sanitizedEntry, userId }], session ? { session } : undefined);
    await writeAuditEvent({
      userId,
      entity: 'entry',
      action: 'create',
      after: cleanEntryForAudit(createdEntry.toObject()),
    }, session);
    return createdEntry;
  });
  notifyClients(userId, ['entries']);
  return entry;
}

export async function updateEntry(userId, id, body = {}) {
  const { previousState, ...updates } = body;
  const { result } = await withOptionalTransaction(async (session) => {
    const currentQuery = Entry.findOne({ id, userId });
    if (session) currentQuery.session(session);
    const current = await currentQuery;
    if (!current) return { status: 404, body: { error: 'Entry not found' } };

    const settings = await getUserSettings(userId, session);
    const resolution = resolveEntryUpdate(current.toObject(), previousState, updates, settings);
    if (resolution.type === 'conflict') {
      return {
        status: 409,
        body: toConflictResponse(current.toObject(), resolution),
      };
    }

    current.set(resolution.entry);
    await current.save(session ? { session } : undefined);
    await writeAuditEvent({
      userId,
      entity: 'entry',
      action: resolution.type === 'merged' ? 'merge' : 'update',
      before: cleanEntryForAudit(previousState || {}),
      after: cleanEntryForAudit(current.toObject()),
      meta: resolution.type === 'merged'
        ? {
            mergedFields: resolution.clientChangedFields,
            serverChangedFields: resolution.serverChangedFields,
          }
        : null,
    }, session);
    return { status: 200, body: current.toObject() };
  });

  if (result.status === 200) {
    notifyClients(userId, ['entries']);
  }
  return result;
}

export async function deleteEntry(userId, id, body = {}) {
  const previousState = body?.previousState;
  const force = body?.force === true;
  const { result } = await withOptionalTransaction(async (session) => {
    const currentQuery = Entry.findOne({ id, userId });
    if (session) currentQuery.session(session);
    const current = await currentQuery;
    if (!current) return { status: 404, body: { error: 'Entry not found' } };

    const currentObject = current.toObject();
    if (entriesConflict(currentObject, previousState) && !force) {
      return {
        status: 409,
        body: {
          error: 'Entry changed elsewhere',
          current: currentObject,
          conflicts: ['delete'],
        },
      };
    }

    await current.deleteOne(session ? { session } : undefined);
    await writeAuditEvent({
      userId,
      entity: 'entry',
      action: force && entriesConflict(currentObject, previousState) ? 'force-delete' : 'delete',
      before: cleanEntryForAudit(currentObject),
    }, session);
    return { status: 200, body: { success: true } };
  });

  if (result.status === 200) {
    notifyClients(userId, ['entries']);
  }
  return result;
}
