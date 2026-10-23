# DTR and exports

The DTR Sheet renders a printable month view of the account's entries. A user can navigate months, sign off a month, print, and download the sheet as PDF or Excel.

## Sub-features

- `dtr-sheet` renders the month with times, hours, overtime, activities, and remarks.
- `dtr-totals` sums hours, overtime, and days worked.
- `dtr-pdf` downloads a PDF named for the profile and account.
- `dtr-excel` downloads an Excel workbook named for the profile and account.
- `dtr-signoff` records a supervisor sign-off for the month.

## How to get to it (user POV)

- Choose `DTR Sheet` in the sidebar.
- Use `Prev` and `Next` in the page header to change months.
- Choose `PDF` or `Excel` in the page header to download.
- Choose `Supervisor Sign-Off` to record approval.

## Driving it with verify.mjs

Preconditions:

- The isolated stack is healthy: `npm run verify -- doctor` passes.
- The browser starts signed out.
- No entry exists for today's local date. The journey seeds one when needed.

Run `npm run verify -- run dtr-export`. The journey performs every action below and writes evidence to `output/verification/<runId>-dtr-export/`.

- **Sign in and seed.** Log in with the scratch account, open `Time Log`, and add a Present entry for today with `08:00-12:00` and `13:00-17:00`.
- **Open the sheet.** Choose `DTR Sheet` (`a[data-nav-path="/dtr"]`). The `DTR Sheet` heading appears and `#dtr-printable` contains the entry's `Verification entry` activities.
- **Check the total.** The sheet totals `8.00` hours. Evidence: `01-dtr-sheet.png`.
- **Download the PDF.** Choose `PDF` (`#btn-export-pdf`). A download ends in `.pdf`, is larger than 1 KB, and its filename contains the account username.
- **Download Excel.** Choose `Excel` (`#btn-export-excel`). A download ends in `.xlsx`, is larger than 1 KB, and its filename contains the account username. Evidence: `02-downloads-saved.png`.
- **Check the files.** Both downloads are saved under the evidence directory and named in `result.json`.

Proof: `result.json` has `"ok": true`, `data.pdf` and `data.excel` record the real filenames and sizes, and both files exist in the evidence directory.

## Gotchas

- The sheet formats numbers with two decimals: `8.00`, not `8h`.
- The PDF export leaves activities out on purpose. The on-screen sheet and the Excel workbook keep them, so assert activities against the sheet or workbook, not the PDF.
- `exportDTRtoPDF` takes `signOff` as its eighth argument. Dropping that trailing parameter raises `ReferenceError: signOff is not defined`, logs `PDF export error`, and produces no download. The harness catches this as a timeout, so read `consoleErrors` in `result.json`.
- Exports use the profile name and username in the filename. An empty profile name falls back to `OJT_Trainee`.
- The sheet fetches the selected month's entries asynchronously. Wait for `#dtr-printable` and the activity text, not just the heading.
- Sign-off is not covered by this journey. It writes stored approval state and should get its own section when it becomes part of the maintained map.
