import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDTRExportFilename,
  buildJsonExportFilename,
} from './export-filenames.js';

test('buildDTRExportFilename includes name, covered month, and export date', () => {
  assert.equal(
    buildDTRExportFilename({
      profileName: 'Kenneth Laron',
      username: 'kenneth.awani',
      month: 3,
      year: 2026,
      exportedDate: '2026-04-14',
      extension: 'pdf',
    }),
    'Kenneth_Laron_kenneth_awani_DTR_April_2026_exported_2026-04-14.pdf'
  );
});

test('buildJsonExportFilename falls back cleanly when profile name is missing', () => {
  assert.equal(
    buildJsonExportFilename({
      profileName: '',
      username: 'kenneth.awani',
      exportedDate: '2026-04-14',
    }),
    'OJT_Trainee_kenneth_awani_OJT_DTR_Backup_exported_2026-04-14.json'
  );
});

test('buildJsonExportFilename normalizes characters unsafe for filenames', () => {
  assert.equal(
    buildJsonExportFilename({
      profileName: 'Kenneth / Laron',
      username: 'john:kenneth',
      exportedDate: '2026-04-14',
    }),
    'Kenneth_Laron_john_kenneth_OJT_DTR_Backup_exported_2026-04-14.json'
  );
});
