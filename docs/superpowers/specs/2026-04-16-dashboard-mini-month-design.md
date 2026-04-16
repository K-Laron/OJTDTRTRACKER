# Dashboard Mini Month Design

## Goal

Add a compact current-month calendar widget to the dashboard that gives quick visual status context and opens the full Calendar page when a day is clicked.

## Current State

- The dashboard in [src/pages/dashboard.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\src\pages\dashboard.js) focuses on clock state, progress, alerts, and recent entries.
- The full month calendar lives in [src/pages/calendar.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\src\pages\calendar.js) and already owns month navigation and day-status presentation.
- Calendar status logic is tightly coupled to the calendar page, which risks duplication if a dashboard widget reimplements it independently.

## Chosen Approach

Use a read-only **current-month mini calendar** card on the dashboard.

- Show the current month in a compressed 7-column grid.
- Reuse the same entry and holiday status rules as the main calendar.
- Keep the widget informational only.
- Clicking any active day cell navigates to the full Calendar page and focuses the same month.

## Rejected Alternatives

### Full calendar on the dashboard

- Rejected because it duplicates the purpose of the Calendar page.
- Increases dashboard weight and visual noise.

### This-week-only widget

- Rejected because Kenneth asked for a mini month.
- Less familiar than a normal calendar month layout.

### Month with status dots only

- Rejected because it reduces readability and loses quick hour/status context.

## UX Design

### Placement

- Add the mini month as a dedicated dashboard card below the high-level summary area.
- Keep it above or beside recent entries depending on current dashboard layout and available width.

### Content

- Card header shows the current month and year.
- Grid shows weekday headers and day cells for the current month.
- Day cells use the same color meaning already used in the full Calendar page.
- Each day cell shows:
  - day number
  - short secondary label when available, such as worked hours or holiday name if space allows

### Interaction

- Clicking a populated or empty day cell routes to `#/calendar`.
- The Calendar page should open on the same month as the clicked day.
- No inline editing, tooltips, popups, or holiday controls in the dashboard widget.

### Responsiveness

- On desktop, the mini month should remain clearly legible and compact.
- On mobile, the widget may stack lower in the dashboard instead of shrinking cell content too aggressively.
- If space is insufficient, truncate secondary labels before shrinking the grid further.

## Architecture

### Shared status logic

The mini month should not create a second copy of calendar-status rules.

- Extract or reuse the day-status calculation already used by the full Calendar page.
- Keep the source of truth in one place so dashboard and Calendar stay visually consistent.

### Calendar focus handoff

- Introduce a lightweight month-focus handoff so dashboard clicks can open the Calendar page on a specific month.
- Prefer a small shared UI state mechanism over duplicating month parsing logic in multiple pages.

## Affected Files

- Modify [src/pages/dashboard.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\src\pages\dashboard.js)
  - render the mini-month card
  - wire day-cell click navigation
- Modify [src/pages/calendar.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\src\pages\calendar.js)
  - accept or read month focus from dashboard navigation
- Modify [src/style.css](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\src\style.css)
  - add compact calendar widget styles
- Possibly modify [src/store.js](C:\Users\TESS LARON\Desktop\OJT DTR TRACKER\src\store.js) or a shared helper
  - only if needed to avoid duplicating status derivation

## Data And State Rules

- Widget month is always the current month when the dashboard loads.
- The widget uses the existing entries and holidays already available in app state.
- If the user clicks a day in a different month view later, that behavior still belongs only to the full Calendar page, not the dashboard widget.

## Error Handling

- If entries or holidays are still loading, render the widget using the best available local state.
- If there is no record for a workday, show the same neutral or absent treatment already used by the current Calendar rules.
- Avoid introducing any new network requests solely for the dashboard widget.

## Testing Strategy

- Add a focused test for any extracted day-status helper if one is introduced.
- Verify dashboard rendering still succeeds when:
  - there are no entries
  - there are holidays in the current month
  - there are present, late, absent, and no OJT states
- Verify clicking a dashboard calendar day opens the Calendar page on the correct month.
- Run the narrowest meaningful automated checks plus a production build.

## Risks

- Duplicating status logic between dashboard and Calendar will create drift.
- Overly dense text inside the mini month can make the widget unreadable on smaller screens.
- Month-navigation handoff must remain simple so it does not create hidden route state bugs.

## Success Criteria

- The dashboard shows a compact current-month calendar widget.
- Widget statuses visually match the main Calendar page for the same dates.
- Clicking a day opens the full Calendar page on the correct month.
- The widget adds context without replacing or duplicating the full Calendar workflow.
