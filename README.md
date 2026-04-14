# OJT DTR Tracker

OJT DTR Tracker is a local desktop daily time record system for OJT hour tracking. The current system is a browser app served by Vite on the frontend, an Express API on the backend, and MongoDB for persistence, with account-based login, PDF/Excel export, JSON backup/import, activity history, and Philippine holiday sync.

## What It Does

- Tracks AM and PM time in/out entries
- Tracks one day-level status per record: Present, Leave, Vacation, Holiday, No OJT, or Absent
- Recalculates rendered hours, overtime, late minutes, and undertime on the server
- Generates DTR views plus PDF and Excel exports with detailed filenames that include profile name, account username, covered period, and export date
- Supports login/registration, config updates, notification reminders, and auto-backup JSON downloads
- Supports holiday records, public-holiday sync, JSON export/import preview, activity templates, and batch status updates
- Supports activity history with restore actions for entries, holidays, config, and imports
- Pushes live updates to the frontend through `/api/sync`

## Runtime Architecture

- Frontend: Vite + vanilla JavaScript on `http://localhost:5173`
- Backend: Express API on port `5000`
- Database: MongoDB via Mongoose
- Export: `jspdf`, `jspdf-autotable`, `xlsx`
- Runtime logs: `.runtime/server.log` and `.runtime/vite.log`
- Runtime process state: `.runtime/tracker-pids.json`

## Project Layout

```text
OJT DTR TRACKER
├─ src/                    Frontend app, pages, store, router, styles, export helpers
├─ server/                 Express API, models, tracker core logic, tests
├─ scripts/                Windows PowerShell and Node helpers for startup and MongoDB
├─ mongo/                  Local MongoDB config for the optional workspace replica set
├─ public/                 Static assets and PWA files
├─ LOCAL_SETUP.md          Local Mongo and launcher notes for this workspace
├─ Start-Tracker.bat       Starts the app with hidden background services
├─ Stop-Tracker.bat        Stops the tracker services and local MongoDB helper
├─ package.json            Frontend scripts and shared dependencies
└─ README.md               Main project documentation
```

## Requirements

- Windows
- Node.js
- MongoDB installed locally
- `mongod.exe` available at `C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe`, or update `scripts/Start-LocalMongoReplicaSet.ps1`

## Install

```powershell
npm install
```

## Daily Use

Recommended launcher flow:

```powershell
.\Start-Tracker.bat
```

That launcher:

- starts the optional workspace-local Mongo helper on port `27018`
- starts the backend on port `5000` if it is not already listening
- launches the backend with `MONGODB_URI=mongodb://127.0.0.1:27018/ojt_dtr_tracker?replicaSet=rs0`
- starts the Vite frontend on port `5173` if it is not already listening
- opens `http://localhost:5173`

To stop everything started by the launcher:

```powershell
.\Stop-Tracker.bat
```

## Direct Development Commands

Run the frontend only:

```powershell
npm run dev
```

Build the frontend:

```powershell
npm run build
```

Run tests:

```powershell
npm test
```

Run the backend manually:

```powershell
cd .\server
node .\server.js
```

## MongoDB Connection Modes

Launcher mode and manual mode are different on purpose:

- `.\Start-Tracker.bat` and `scripts/Start-TrackerServices.ps1` force the backend to use the workspace-local replica set on `127.0.0.1:27018`.
- Manual backend runs still read `MONGODB_URI` from `server/.env` when present. If it is not set, the code falls back to:

```text
mongodb://localhost:27017/ojt_dtr_tracker
```

The bundled local Mongo helper started by `scripts/Start-LocalMongoReplicaSet.ps1` runs on `127.0.0.1:27018` with replica set `rs0`. That helper is the default database path for the launcher flow and remains available for manual runs if you point `server/.env` at the same replica-set URI.

Example local replica-set URI:

```text
mongodb://127.0.0.1:27018/ojt_dtr_tracker?replicaSet=rs0
```

## Main API Areas

- `/api/auth/register` and `/api/auth/login`
- `/api/entries`
- `/api/holidays`
- `/api/config`
- `/api/import/preview` and `/api/import`
- `/api/audit`
- `/api/sync`

## Main Scripts

- `Start-Tracker.bat`: launches the app in the background
- `Stop-Tracker.bat`: stops frontend, backend, and the local Mongo helper
- `scripts/Start-LocalMongoReplicaSet.ps1`: starts local MongoDB on port `27018`
- `scripts/Stop-LocalMongoReplicaSet.ps1`: stops the local MongoDB process on port `27018`
- `scripts/Start-TrackerServices.ps1`: hidden startup helper for backend and frontend
- `scripts/Stop-TrackerServices.ps1`: hidden shutdown helper for backend and frontend
- `scripts/ensure-local-mongo-rs.mjs`: initializes or verifies replica set `rs0`

## Current Capabilities

- Server-side validation and recalculation of entry totals
- Conflict detection and merge-aware stale update handling
- Import preview before full replace
- Larger JSON imports up to the backend request limit of `5 MB`
- Audit trail with restore actions
- Philippine public-holiday synchronization with cached retry backoff when the public API is unavailable
- DTR printing plus PDF and Excel export with detailed filenames
- Manual JSON export and auto-backup downloads with detailed filenames
- Reports, attendance summaries, and activity history
- Workday-aware completion forecasting that excludes future holidays, leave, vacation, and no-OJT dates
- Activity templates, reuse-previous-day helpers, batch status updates, summary-pack reporting, and data-quality alerts
- Browser notification reminders and configurable auto-backup cadence

## Day Status Rules

- `Present` days keep AM/PM time entries and contribute rendered hours.
- `Leave`, `Vacation`, `Holiday`, `No OJT`, and `Absent` days contribute `0` rendered hours.
- Completion forecasts skip future weekdays that are marked as holidays, leave, vacation, or no-OJT days.

## Notes

- This project is tuned for a local desktop workflow, but data is stored per account through the built-in login system.
- Generated folders such as `.runtime/`, `dist/`, `node_modules/`, and local Mongo data are not committed.
- `server/.env` is intentionally local-only and not committed.

## License

ISC
