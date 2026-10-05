import { Config } from '../models.js';
import { withOptionalTransaction } from '../db.js';
import { notifyClients } from '../sync-hub.js';
import { writeAuditEvent } from './audit.service.js';
import { cleanConfigForAudit } from './snapshots.js';

export async function getConfig(userId) {
  let config = await Config.findOne({ userId }).lean();
  if (!config) {
    const created = new Config({ userId });
    await created.save();
    config = created.toObject();
  }
  return config;
}

export async function updateConfig(userId, body) {
  const { result } = await withOptionalTransaction(async (session) => {
    const previousQuery = Config.findOne({ userId });
    if (session) previousQuery.session(session);
    const previousConfig = await previousQuery.lean();
    const config = await Config.findOneAndUpdate(
      { userId },
      body,
      { returnDocument: 'after', upsert: true, session: session || undefined }
    );
    await writeAuditEvent({
      userId,
      entity: 'config',
      action: 'update',
      before: cleanConfigForAudit(previousConfig),
      after: cleanConfigForAudit(config.toObject ? config.toObject() : config),
    }, session);
    return { status: 200, body: config.toObject ? config.toObject() : config };
  });

  if (result.status === 200) {
    notifyClients(userId, ['config']);
  }
  return result;
}
