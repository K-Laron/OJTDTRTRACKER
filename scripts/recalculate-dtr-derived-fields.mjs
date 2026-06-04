import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Config, Entry } from '../server/models.js';
import { buildEntryRecalculationPlan } from '../server/dtr-recalculation.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../server/tracker-core.js';

dotenv.config();

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const userIdArg = process.argv.find(arg => arg.startsWith('--user-id='));
const userId = userIdArg ? userIdArg.slice('--user-id='.length).trim() : '';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ojt_dtr_tracker';

function toSerializableChange(change) {
  return {
    id: change.id,
    userId: change.userId,
    date: change.date,
    before: change.before,
    after: change.after,
  };
}

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

async function main() {
  await mongoose.connect(MONGODB_URI);

  const entryQuery = userId ? { userId } : {};
  const [entries, configs] = await Promise.all([
    Entry.find(entryQuery).sort({ userId: 1, date: 1 }).lean(),
    Config.find(userId ? { userId } : {}).lean(),
  ]);
  const settingsByUserId = new Map(configs.map(config => [
    config.userId,
    normalizeSettings(config.settings || DEFAULT_SETTINGS),
  ]));
  const plan = buildEntryRecalculationPlan(entries, settingsByUserId);

  console.log(`Scanned entries: ${plan.scanned}`);
  console.log(`Entries needing recalculation: ${plan.changed}`);
  plan.changes.slice(0, 20).forEach(change => {
    console.log(JSON.stringify(toSerializableChange(change)));
  });
  if (plan.changed > 20) {
    console.log(`...and ${plan.changed - 20} more`);
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
  let updated = 0;
  for (const change of plan.changes) {
    const result = await Entry.updateOne(
      { id: change.id, userId: change.userId },
      { $set: change.after }
    );
    updated += result.modifiedCount || 0;
  }

  console.log(`Backup written: ${backupPath}`);
  console.log(`Entries updated: ${updated}`);
}

main()
  .catch(err => {
    console.error('DTR recalculation failed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
