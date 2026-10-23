# Time Log

Time Log records a day of work. A user adds a date, status, AM and PM time pairs, and activities. The server recalculates rendered hours, overtime, late minutes, and undertime, and the row survives a reload.

## Sub-features

- `entry-add` saves a Present day with AM and PM times.
- `entry-recalculate` derives 8 rendered hours on the server.
- `entry-list` shows the saved date, status, and hours in the table.
- `entry-persist` keeps the entry after a reload.

## How to get to it (user POV)

- Choose `Time Log` in the sidebar.
- Choose `Add Entry` in the page header.
- Fill the modal and choose `Add Entry` in its footer.

## Driving it with verify.mjs

Preconditions:

- The isolated stack is healthy: `npm run verify -- doctor` passes.
- The browser starts signed out.
- No entry exists for today's local date. The journey reuses an existing row when one is present.

Run `npm run verify -- run time-log`. The journey performs every action below and writes evidence to `output/verification/<runId>-time-log/`.

- **Sign in.** Log in with the scratch account from `stack.json`. The Dashboard heading appears.
- **Open Time Log.** Choose `Time Log` (`a[data-nav-path="/timelog"]`). The `Time Log` heading appears. On a fresh database the empty state reads `No entries found`. Evidence: `01-empty-time-log.png`.
- **Open the editor.** Choose `Add Entry` (`#btn-add-entry`). The modal shows `#entry-save` and the status defaults to Present.
- **Fill the day.** Set `#entry-date` to today, `#entry-status` to `present`, times `08:00`, `12:00`, `13:00`, `17:00`, and activities to `Verification entry`.
- **Save.** Choose `Add Entry` (`#entry-save`). The modal closes and a row for today appears with `Present` and `8h`. Evidence: `02-entry-saved.png`.
- **Reload.** Reload the page. The same row is present. Evidence: `03-entry-survives-reload.png`.
- **Check the side effect.** `GET /api/entries?date_from=<today>&date_to=<today>` returns one entry with `hoursRendered: 8`. Evidence: `api-entry.json`.

Proof: `result.json` has `"ok": true`, `data.hoursRendered` is `8`, and the screenshots plus `api-entry.json` exist.

## Gotchas

- Rendered hours sum the AM and PM windows. Break duration is not subtracted, so `08:00-12:00` and `13:00-17:00` is exactly 8 hours.
- The list filters by month. A date outside the selected month is saved but not visible; the journey uses today's date so the current month includes it.
- A toast alone is not proof. The assertions use the rendered row and the API response.
- Fridays after 2026-03-09 are scheduled non-working days for forecasting. The entry still saves as Present, so do not assert workday scheduling from this journey.
- The modal closes and detaches on success. Wait for `#entry-save` to detach, not for a toast.

