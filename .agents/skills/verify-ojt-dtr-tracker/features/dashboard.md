# Dashboard

The Dashboard summarizes the account: rendered hours against the required total, a weekly progress bar, attendance, completion forecast, and the most recent entries.

## Sub-features

- `dashboard-totals` sums rendered hours from saved entries.
- `dashboard-week` shows hours against the weekly target.
- `dashboard-recent` lists the latest entries with their dates.
- `dashboard-forecast` estimates completion from the recorded pace.

## How to get to it (user POV)

- Sign in and the app routes to the Dashboard.
- Choose `Dashboard` in the sidebar from any page.

## Driving it with verify.mjs

Preconditions:

- The isolated stack is healthy: `npm run verify -- doctor` passes.
- The browser starts signed out.
- No entry exists for today's local date. The journey seeds one when needed.

Run `npm run verify -- run dashboard`. The journey performs every action below and writes evidence to `output/verification/<runId>-dashboard/`.

- **Sign in.** Log in with the scratch account. The Dashboard heading appears.
- **Seed a day.** Open `Time Log`, add a Present entry for today with `08:00-12:00` and `13:00-17:00`, and wait for its row.
- **Return to the Dashboard.** Choose `Dashboard` (`a[data-nav-path="/"]`). The heading appears.
- **Check rendered hours.** The `Hours Rendered` row reads `8h`.
- **Check recent entries.** The `Recent Entries` card contains today's formatted date. Evidence: `01-dashboard-with-entry.png`.
- **Check the side effect.** `GET /api/entries` still returns the entry the card rendered.

Proof: `result.json` has `"ok": true`, `data.dashboardTotalHours` is `8`, and the screenshot exists.

## Gotchas

- The Dashboard total aggregates every dated entry for the account. Use a fresh stack for this proof; a reused stack with extra entries changes the total.
- The recent entries list is capped. A very old seeded date can be absent even though the total is correct.
- Forecast rows depend on today's date and holidays. This journey asserts totals and recent entries, not a specific estimated completion date.
- Hours render through `fmtHours`, so a whole number reads `8h`, not `8.00`.
