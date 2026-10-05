import { Config, Entry, Holiday } from '../models.js';
import { buildImportPreview, sanitizeImportPayload } from '../tracker-core.js';
import { withOptionalTransaction } from '../db.js';
import { notifyClients } from '../sync-hub.js';
import { writeAuditEvent } from './audit.service.js';
import { getUserStateSnapshot } from './snapshots.js';

export async function previewImport(userId, body = {}) {
  const sanitized = sanitizeImportPayload(body);
  const currentState = await getUserStateSnapshot(userId);
  return { status: 200, body: buildImportPreview(sanitized, currentState) };
}

export async function applyImport(userId, body = {}) {
  let backup = null;
  try {
    const sanitized = sanitizeImportPayload(body);
    const importAfterState = {
      entries: sanitized.entries,
      holidays: sanitized.holidays,
      profile: sanitized.profile,
      settings: sanitized.settings,
      theme: sanitized.theme,
    };

    const { result, usedTransaction } = await withOptionalTransaction(async (session) => {
      const beforeState = await getUserStateSnapshot(userId, session);
      if (!session) backup = structuredClone(beforeState);

      await Promise.all([
        Entry.deleteMany({ userId }, session ? { session } : undefined),
        Holiday.deleteMany({ userId }, session ? { session } : undefined),
        Config.deleteMany({ userId }, session ? { session } : undefined),
      ]);

      if (sanitized.entries.length) {
        await Entry.insertMany(
          sanitized.entries.map(entry => ({ ...entry, userId })),
          session ? { session } : undefined
        );
      }

      if (sanitized.holidays.length) {
        await Holiday.insertMany(
          sanitized.holidays.map(holiday => ({ ...holiday, userId })),
          session ? { session } : undefined
        );
      }

      await Config.create([{
        userId,
        profile: sanitized.profile,
        settings: sanitized.settings,
        theme: sanitized.theme,
      }], session ? { session } : undefined);

      await writeAuditEvent({
        userId,
        entity: 'import',
        action: 'replace',
        before: beforeState,
        after: importAfterState,
        meta: { transactional: Boolean(session) },
      }, session);

      return {
        success: true,
        message: session
          ? 'Data imported successfully'
          : 'Data imported successfully (without Mongo transactions)',
      };
    });
    notifyClients(userId, ['entries', 'holidays', 'config']);
    return { status: 200, body: { ...result, transactional: usedTransaction } };
  } catch (err) {
    if (backup) {
      try {
        await Promise.all([
          Entry.deleteMany({ userId }),
          Holiday.deleteMany({ userId }),
          Config.deleteMany({ userId })
        ]);
        if (backup.entries?.length) await Entry.insertMany(backup.entries.map(entry => ({ ...entry, userId })));
        if (backup.holidays?.length) await Holiday.insertMany(backup.holidays.map(holiday => ({ ...holiday, userId })));
        await new Config({
          userId,
          profile: backup.profile,
          settings: backup.settings,
          theme: backup.theme,
        }).save();
        await writeAuditEvent({
          userId,
          entity: 'import',
          action: 'rollback',
          before: {
            error: err.message || 'Unknown import failure',
          },
          after: backup,
          meta: { restoredFromFallback: true },
        });
        notifyClients(userId, ['entries', 'holidays', 'config']);
      } catch (restoreErr) {
        console.error('Import rollback error:', restoreErr);
      }
    }
    throw err;
  }
}
