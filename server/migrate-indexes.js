const LEGACY_INDEXES = [
  // entries: old global unique id_1 replaced by compound { userId: 1, id: 1 }
  { collection: 'entries', name: 'id_1', dropWhen: () => true },
  // holidays: old non-unique userId_1_date_1 replaced by unique compound
  { collection: 'holidays', name: 'userId_1_date_1', dropWhen: (existing) => !existing.unique },
  // auditevents: old non-TTL ts_1 replaced by 730-day TTL (Mongoose pluralizes
  // the AuditEvent model name without camelcase splitting)
  { collection: 'auditevents', name: 'ts_1', dropWhen: (existing) => !('expireAfterSeconds' in existing) },
];

// Drops stale indexes left by earlier schemas so Mongoose can recreate them
// with current options. Missing collections or indexes are ignored. Duplicate
// rows are left in place; the unique index is then skipped by MongoDB and the
// app-level duplicate checks keep applying.
export async function migrateIndexes(db = null) {
  const target = db ?? (await import('mongoose')).default.connection.db;
  if (!target) return;
  for (const { collection, name, dropWhen } of LEGACY_INDEXES) {
    let indexes;
    try {
      indexes = await target.collection(collection).indexes();
    } catch (err) {
      if (err?.code === 26 || /ns not found/i.test(err.message || '')) continue;
      throw err;
    }
    const existing = indexes.find((index) => index.name === name);
    if (!existing || !dropWhen(existing)) continue;
    await target.collection(collection).dropIndex(name);
    console.log(`Dropped legacy index ${name} on ${collection}`);
  }
}
