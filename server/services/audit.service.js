import { AuditEvent } from '../models.js';

export async function writeAuditEvent(event, session = null) {
  await AuditEvent.create([{
    ts: new Date(),
    meta: null,
    ...event,
  }], session ? { session } : undefined);
}

export async function readAuditEvents(userId, limit = 50) {
  return AuditEvent
    .find({ userId })
    .sort({ ts: -1, _id: -1 })
    .limit(limit)
    .lean();
}
