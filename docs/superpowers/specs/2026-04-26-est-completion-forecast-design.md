# Estimated Completion Forecast Design

## Goal

Improve the OJT completion forecast so it uses all useful attendance data, favors current work patterns, and gives Kenneth a practical date range instead of one fragile estimate.

## Current State

- Forecast logic exists in [server/tracker-core.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\server\tracker-core.js) and is mirrored in [src/store.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\src\store.js).
- The current forecast uses all present days with rendered hours, divides remaining hours by the simple average, and skips scheduled non-workdays plus known future leave, vacation, holiday, and no-OJT dates.
- The dashboard in [src/pages/dashboard.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\src\pages\dashboard.js) displays a single estimated completion date and a small excluded-days note.

## Chosen Approach

Use a weighted recent-trend forecast as the primary estimate and add conservative, expected, and optimistic scenarios.

- Keep the expected estimate based on a weighted average.
- Weight recent complete worked days more than older days.
- Still use older valid worked days so the forecast does not overreact to one unusual week.
- Add scenario dates so Kenneth can see a realistic range.
- Add confidence and suggestions so weak data is visible.

## Rejected Alternatives

### Simple improved average

- Rejected because it still treats old and recent behavior equally.
- It is easy to maintain but does not react when Kenneth's current schedule changes.

### Scenario forecast only

- Rejected because scenarios need a strong expected estimate underneath.
- A range without confidence or data-quality notes can look more precise than it is.

## Forecast Inputs

Use every data source already available in the app.

- `settings.requiredHours` for the target hour total.
- `settings.weeklyTarget` as context for suggestions, not as the main forecast divisor.
- Present entries with positive rendered hours for productivity averages.
- Entry dates to calculate recency and trend.
- Future entry statuses for leave, vacation, holiday, no-OJT, and absent planning.
- Holiday records when no entry already exists on the same date.
- Shared work schedule rules from [shared/work-schedule.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\shared\work-schedule.js), including the four-day workweek from 2026-03-09.

## Data Rules

- Valid worked days are present entries with `hoursRendered > 0` and enough clock data to be considered complete.
- Incomplete present days should not drive the average, but they should create a confidence warning.
- Non-present statuses contribute zero rendered hours.
- Future scheduled workdays are skipped when they are known leave, vacation, holiday, or no-OJT days.
- Scheduled non-workdays are skipped before status checks.
- If remaining hours are already zero, all scenarios estimate completion on the forecast date.

## Scenario Rules

The forecast should return three scenarios:

- Conservative: lower bound from recent and lifetime patterns.
- Expected: weighted average where recent complete days matter more.
- Optimistic: higher bound from recent and lifetime patterns, capped by a realistic workday maximum.

The implementation should keep the existing `avgPerDay`, `workingDaysRemaining`, `neededAvgHoursPerDay`, `estimatedDate`, and `excludedDates` fields where possible. Existing fields should map to the expected scenario so current dashboard rendering has a stable migration path.

## Output Shape

The forecast should include:

- `totalHours`
- `remainingHours`
- `lifetimeAvgPerDay`
- `recentAvgPerDay`
- `weightedAvgPerDay`
- `avgPerDay`
- `workingDaysRemaining`
- `neededAvgHoursPerDay`
- `estimatedDate`
- `excludedDates`
- `confidence`
- `confidenceReasons`
- `suggestions`
- `scenarios.conservative`
- `scenarios.expected`
- `scenarios.optimistic`

Each scenario should include:

- `label`
- `avgPerDay`
- `workingDaysRemaining`
- `neededAvgHoursPerDay`
- `estimatedDate`
- `excludedDates`

## Suggestions

Suggestions should be concise and derived from the data.

- Mention incomplete present days when they were excluded from averages.
- Mention low confidence when there are fewer than three complete worked days.
- Mention when the recent average is materially slower or faster than the lifetime average.
- Mention how many known future non-working days were excluded.
- Mention the needed daily pace based on the expected scenario.

## Architecture

### Forecast helper

Keep calculation logic server-side in [server/tracker-core.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\server\tracker-core.js). The frontend mirror in [src/store.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\src\store.js) should be updated to match the same behavior for local dashboard rendering.

Do not introduce a new dependency. Use small pure helper functions for:

- normalizing forecast entries
- selecting complete worked days
- calculating weighted averages
- projecting a scenario date
- deriving confidence and suggestions

### Dashboard display

Update [src/pages/dashboard.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\src\pages\dashboard.js) to show:

- expected estimated completion date
- conservative to optimistic date range
- expected average hours per day
- working days left
- the first one or two suggestions

Keep the card compact so the progress panel remains scannable.

## Error Handling

- Return `null` when there is no usable present-day data.
- Avoid throwing from dashboard forecast rendering.
- Guard against zero or invalid averages.
- Cap projection loops with a reasonable maximum iteration count so bad input cannot create an infinite loop.

## Testing Strategy

- Add server tests for weighted forecast fields and scenario dates.
- Add tests for incomplete present days lowering confidence without affecting averages.
- Add tests that future leave, vacation, holiday, no-OJT dates, and scheduled Fridays are skipped.
- Add tests for completed requirements returning the forecast date across all scenarios.
- Run `npm test`.
- Run `npm run build` if implementation touches dashboard rendering.

## Affected Files

- Modify [server/tracker-core.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\server\tracker-core.js)
  - improve forecast calculation and output fields
- Modify [server/tracker-core.test.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\server\tracker-core.test.js)
  - cover weighting, scenarios, confidence, and exclusions
- Modify [src/store.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\src\store.js)
  - mirror forecast behavior used by the dashboard
- Modify [src/pages/dashboard.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\src\pages\dashboard.js)
  - display the expected estimate, scenario range, and suggestions

## Risks

- The server and frontend forecast mirrors can drift if only one side changes later.
- Scenario averages can imply false precision if the confidence label is not visible.
- Existing dashboard fields must stay backward-compatible during the UI update.

## Success Criteria

- Forecast uses all valid worked-day history while favoring recent complete days.
- Dashboard shows an expected date plus a conservative-to-optimistic range.
- Forecast suggestions explain data quality and pace in plain language.
- Existing non-working-day exclusions continue to work.
- Automated tests cover the new calculation behavior.
