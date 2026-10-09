import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Config, Entry } from '../server/models.js';
import { buildEntryRecalculationPlan } from '../server/services/dtr-recalculation.service.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../server/tracker-core.js';

// Dry run by default. Pass --apply to write, and --user-id=<id> to scope it.
dotenv.config({ path: path.resolve('server/.env') });

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const userIdArg = process.argv.find(arg => arg.startsWith('--user-id='));
const userId = userIdArg ? userIdArg.slice('--user-id='.length).trim() : '';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ojt_dtr_tracker';
const PREVIEW_LIMIT = 20;
const BATCH_SIZE = 500;

async function writeBackup(changes) {
  const backupDir = path.resolve('output', 'backups');
  await fs.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `dtr-derived-fields-backup-${stamp}.json`);
  await fs.writeFile(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    reason: 'DTR derived field recalculation',
    entries: changes.map(change => change.backup),
  }, null, 2));
  return backupPath;
}

async function applyChanges(changes) {
  const result = { matched: 0, modified: 0 };

  for (let index = 0; index < changes.length; index += BATCH_SIZE) {
    const batch = changes.slice(index, index + BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const outcome = await Entry.bulkWrite(batch.map(change => ({
      updateOne: {
        filter: { id: change.id, userId: change.userId },
        update: { $set: change.after },
      },
    })));
    result.matched += outcome.matchedCount || 0;
    result.modified += outcome.modifiedCount || 0;
  }

  return result;
}

async function main() {
  await mongoose.connect(MONGODB_URI);

  const entryFilter = userId ? { userId } : {};
  const [entries, configs] = await Promise.all([
    Entry.find(entryFilter).sort({ userId: 1, date: 1 }).lean(),
    Config.find(userId ? { userId } : {}).lean(),
  ]);
  const settingsByUserId = new Map(configs.map(config => [
    config.userId,
    normalizeSettings(config.settings || DEFAULT_SETTINGS),
  ]));
  const plan = buildEntryRecalculationPlan(entries, settingsByUserId);

  console.log(`Scanned entries: ${plan.scanned}`);
  console.log(`Entries needing recalculation: ${plan.changed}`);
  plan.changes.slice(0, PREVIEW_LIMIT).forEach(change => {
    console.log(JSON.stringify({ id: change.id, userId: change.userId, date: change.date, before: change.before, after: change.after }));
  });
  if (plan.changed > PREVIEW_LIMIT) {
    console.log(`...and ${plan.changed - PREVIEW_LIMIT} more`);
  }

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write updates and a backup file.');
    return;
  }
  if (!plan.changed) {
    console.log('No updates needed.');
    return;
  }

  const backupPath = await writeBackup(plan.changes);
  const { matched, modified } = await applyChanges(plan.changes);
  console.log(`Backup written: ${backupPath}`);
  console.log(`Entries matched: ${matched}, modified: ${modified}`);
}

main()
  .catch(err => {
    console.error('DTR recalculation failed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());