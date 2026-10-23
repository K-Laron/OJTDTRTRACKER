# OJT DTR Tracker verification map

This directory is the maintained source for verifying the user-facing behavior of OJT DTR Tracker. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- The repo is installed with `npm ci` and Playwright Chromium is available.
- `npm run verify -- launch` started the isolated stack and `npm run verify -- doctor` passes.
- The stack uses its own MongoDB database and ports 27019, 5010, and 5180. It never shares state with the daily-driver app on 5000, 5173, or the real database.
- The launch step registered the scratch account `verify_<runId>`. Journeys read it from `.runtime/verify/stack.json`.
- The seeded entry uses today's local date, status `present`, times `08:00-12:00` and `13:00-17:00`, which is 8 rendered hours.
- Never drive an instance this verification run did not start or adopt through its state file.

## Driving conventions

- Start every recipe from a healthy stack. Run `npm run verify -- doctor` first.
- Drive the UI through [`verify.mjs`](../scripts/verify.mjs), which owns the Playwright browser.
- Prefer stable handles used by the journeys: `data-nav-path`, element IDs such as `#btn-add-entry`, and heading text.
- Treat every command as literal. Keep quoted names and flags unchanged.
- A journey may reuse an existing stack. Seeds are idempotent and skip a date that already has an entry.
- Read `result.json` before reporting a pass. A green exit code without saved evidence is not proof.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes screenshots with the app identity visible.
- Mutation proof includes a reload or an API read after the mutation.
- Export proof includes the downloaded file and its parsed contents or size.
- Report an unreachable path with the attempted feature and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify.mjs` starts with `Preconditions:` and pairs each user action with the exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Auth](./auth.md) covers registration, session persistence, logout, and sign-in.
- [Time Log](./time-log.md) covers adding an entry, server recalculation, and persistence.
- [Dashboard](./dashboard.md) covers rendered totals and the recent entries list.
- [DTR and exports](./dtr-export.md) covers the DTR sheet plus PDF and Excel downloads.
- [Settings and JSON backup](./settings-backup.md) covers saved settings and the JSON backup export.
