# Settings and JSON backup

Settings stores the profile and tracker preferences, including required hours, weekly target, break duration, expected schedule, theme, and notifications. Data Management exports the account state as a JSON backup and can preview an import.

## Sub-features

- `settings-profile` saves name, position, department, school, supervisor, and start date.
- `settings-ojt` saves required hours, weekly target, break duration, and expected times.
- `settings-theme` switches between dark and light.
- `backup-export` downloads the account state as JSON.
- `import-preview` shows a diff before replacing data.

## How to get to it (user POV)

- Choose `Settings` in the sidebar.
- Edit a card and choose its save button.
- Choose `Export JSON` under Data Management to download a backup.
- Choose `Import Data` and pick a JSON file to preview an import.

## Driving it with verify.mjs

Preconditions:

- The isolated stack is healthy: `npm run verify -- doctor` passes.
- The browser starts signed out.
- No entry exists for today's local date. The journey seeds one when needed.

Run `npm run verify -- run settings-backup`. The journey performs every action below and writes evidence to `output/verification/<runId>-settings-backup/`.

- **Sign in and seed.** Log in with the scratch account and add a Present entry for today from `Time Log`.
- **Open Settings.** Choose `Settings` (`a[data-nav-path="/settings"]`). The `Settings` heading appears.
- **Change required hours.** Set `#set-hours` to `480` and choose `Save Settings` (`#btn-save-settings`). The `Settings saved!` toast appears. Evidence: `01-settings-saved.png`.
- **Reload.** Reload the page. The Settings heading appears and `#set-hours` still reads `480`. Evidence: `02-settings-survive-reload.png`.
- **Export the backup.** Choose `Export JSON` (`#btn-export-data`). A JSON download is saved, parses, contains at least one entry, and has `settings.requiredHours` equal to `480`. Evidence: `03-backup-downloaded.png`.

Proof: `result.json` has `"ok": true`, `data.requiredHours` is `480`, `data.entriesInBackup` is at least `1`, and the JSON file exists in the evidence directory.

## Gotchas

- The save handler falls back to `486` required hours and `40` weekly hours when an input is empty or not a number. Always assert the saved value after a reload.
- `Export JSON` serializes the client store, so a reload before the export proves the server round trip. Without the reload, the export can pass on unsaved state.
- The import preview and full replace are not covered by this journey. They overwrite data and need a disposable account plus a fixture file.
- Theme and notification settings are not covered. Browser notification permission is outside the page's control.
