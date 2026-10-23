---
name: verify-ojt-dtr-tracker
description: Drive the OJT DTR Tracker web app in an isolated Mongo, Express, and Vite stack to prove user-facing behavior. Use when changing frontend pages, the API, entry calculations, DTR exports, or settings, and before shipping UI or API work. Runs Playwright journeys that capture screenshots, downloads, and API state.
---
# Verify OJT DTR Tracker

The tracker is a hash-routed vanilla JS app served by Vite, an Express API on `/api`, and MongoDB. A verification run starts a disposable stack, registers a scratch account, drives one feature through the browser, captures evidence under `output/verification/`, and tears the stack down. Nothing touches the ports or database used by `Start-Tracker.bat`.

Feature journeys live in `features/`. Read the index before driving.

## Launch

Prerequisites:

- `npm ci` in the repo root.
- Docker, or `VERIFY_MONGODB_URI` pointing at a scratch database whose name starts with `ojt_verify_`. Never point it at the real tracker database.
- Playwright's Chromium, once per machine: `npx playwright install chromium`.

Start the stack:

```bash
npm run verify -- launch
```

It starts:

- MongoDB `mongo:7` in container `ojt-verify-<runId>` on `127.0.0.1:27019`.
- Express on `127.0.0.1:5010` with `MONGODB_URI` at the scratch DB and `CORS_ORIGINS` at the Vite origin.
- Vite on `127.0.0.1:5180` with `API_PROXY_TARGET` at the backend.

Ports 5000, 5173, 27017, and 27018 are never used. Launch fails instead of taking an occupied port. Override defaults with `VERIFY_BACKEND_PORT`, `VERIFY_FRONTEND_PORT`, and `VERIFY_MONGO_PORT`.

Ready means all three processes answer and `doctor` passes. State is `.runtime/verify/stack.json`. Logs are `.runtime/verify/backend.log` and `.runtime/verify/vite.log`.

Teardown:

```bash
npm run verify -- stop
```

## Doctor

```bash
npm run verify -- doctor
```

Read-only checks:

- Recorded backend and Vite PIDs are alive.
- The backend returns its 404 contract with security headers for an allowed origin.
- Vite serves the app shell.
- The Vite proxy reaches the backend.
- The scratch account can log in, which proves MongoDB is reachable.

Run it before the first drive and after anything surprising. Never drive a stack that fails doctor. Stop it and launch again.

## Drive

```bash
npm run verify -- run <feature>
```

`run` uses the healthy stack when one exists. Otherwise it starts its own and stops it when the journey finishes. Available features are `auth`, `time-log`, `dashboard`, `dtr-export`, and `settings-backup`, also listed by `npm run verify -- features`.

A journey signs in through the UI, exercises the feature the way a user does, asserts what the user and the API can see, and writes screenshots, downloads, and `result.json` to `output/verification/<runId>-<feature>/`. Exit code is 1 on the first failed assertion.

The journey is the contract. Do not weaken an assertion to make it pass. Fix the app, or fix the harness when its handle is stale, and re-drive.

## Evidence

Every proof writes:

- `result.json` with `ok`, the feature, `data` returned by the journey, screenshots, console errors, page errors, and failed requests.
- One PNG per checkpoint, including `failure.png` when a journey fails.
- Downloaded exports for `dtr-export` and `settings-backup`.

Proof standards:

- Exercise the real user path through the UI, not store internals or API shortcuts. API calls are for checking the side effect after the UI action.
- Capture the action and the resulting state. A toast alone is not proof.
- Assert persisted state after a reload or through the API, not only the render right after the click.
- Auth tokens and passwords never go into evidence. Request URLs are redacted.
- Evidence survives `stop`. It lives in `output/`, which is gitignored. Do not commit it.

## Cleanup

`stop` kills only the PIDs recorded in `.runtime/verify/stack.json` and removes only the container named in that file. It refuses to kill a PID whose working directory is not this checkout.

If the state file is lost, the leftovers are the container `ojt-verify-*` on port 27019 and node processes started from this checkout on ports 5010 and 5180. Inspect them before removing anything. Never kill by process name.

Failed journeys still clean up. The drive runner closes the browser in `finally`; `run` stops a stack it started.

## Helpers

All helpers are invoked through `verify.mjs`:

```bash
npm run verify -- launch
npm run verify -- doctor
npm run verify -- run auth
npm run verify -- features
npm run verify -- stop
```

- `scripts/config.mjs` resolves the repo, runtime, evidence, and port settings.
- `scripts/stack.mjs` starts, doctors, and stops the disposable stack.
- `scripts/drive.mjs` holds the Playwright journeys and evidence capture.
- `scripts/verify.mjs` is the CLI above.

Use `node .agents/skills/verify-ojt-dtr-tracker/scripts/verify.mjs <command>` when npm is unavailable.

## Feature map

- [Auth](./features/auth.md)
- [Time Log](./features/time-log.md)
- [Dashboard](./features/dashboard.md)
- [DTR and exports](./features/dtr-export.md)
- [Settings and JSON backup](./features/settings-backup.md)
