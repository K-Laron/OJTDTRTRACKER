# OJT DTR Tracker

OJT DTR Tracker is a local-first daily time record system built for On-the-Job Training hour tracking. It includes a Vite frontend, an Express API, MongoDB persistence, PDF and Excel export, audit history, import preview, and a Windows launcher flow that starts the app with hidden background processes.

## What It Does

- Tracks AM and PM time in/out entries
- Computes rendered hours, overtime, late minutes, and undertime
- Generates DTR views plus PDF and Excel exports
- Shows attendance summaries, reports, and activity history
- Supports holiday and leave tagging
- Automatically syncs Philippine public holidays from a public API
- Supports JSON export, previewed import, and restore from audit snapshots
- Uses local MongoDB with replica-set support for safer transactional writes

## Stack

- Frontend: Vite, vanilla JavaScript, CSS
- Backend: Express
- Database: MongoDB via Mongoose
- Export: `jspdf`, `jspdf-autotable`, `xlsx`
- Runtime: Node.js

## Project Layout

```text
OJT DTR TRACKER
├─ src/                    Frontend app, pages, store, styles, export helpers
├─ server/                 Express API, models, tracker core logic, tests
├─ scripts/                Windows PowerShell helpers for startup and MongoDB
├─ mongo/                  Local MongoDB config for workspace replica-set setup
├─ public/                 Static assets and PWA files
├─ Start-Tracker.bat       Starts the app with hidden background services
├─ Stop-Tracker.bat        Stops the tracker services and local MongoDB
├─ LOCAL_SETUP.md          Local MongoDB replica-set setup notes
└─ package.json            Frontend scripts and shared dependencies
```

## Requirements

- Windows
- Node.js
- MongoDB installed locally
  Expected binary path:
  `C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe`

If your MongoDB installation lives elsewhere, update the path in `scripts/Start-LocalMongoReplicaSet.ps1`.

## Install

```powershell
npm install
```

## Run

Recommended Windows flow:

```powershell
.\Start-Tracker.bat
```

That launcher:

- starts the workspace-local MongoDB replica set
- starts the backend and Vite frontend in hidden background processes
- opens the app in your default browser

To stop everything:

```powershell
.\Stop-Tracker.bat
```

## Development

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

## Local MongoDB Setup

This project is configured to use a workspace-local MongoDB instance on `127.0.0.1:27018` so transaction support does not depend on editing the Windows MongoDB service.

See `LOCAL_SETUP.md` for full setup details.

Quick start:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-LocalMongoReplicaSet.ps1
```

## Main Scripts

- `Start-Tracker.bat`: launches the app in the background
- `Stop-Tracker.bat`: stops frontend, backend, and local MongoDB
- `scripts/Start-LocalMongoReplicaSet.ps1`: starts local MongoDB on port `27018`
- `scripts/Stop-LocalMongoReplicaSet.ps1`: stops the local MongoDB process
- `scripts/Start-TrackerServices.ps1`: hidden app startup helper
- `scripts/Stop-TrackerServices.ps1`: hidden app shutdown helper

## Features Added In This Version

- Server-side validation and recalculation of entry totals
- Import preview and safer bulk replace flow
- Audit trail with restore actions
- Conflict detection for stale edits
- Resource-scoped sync updates
- Lazy-loaded heavy routes
- Wider full-screen layout behavior
- Hidden launcher flow for cleaner app startup

## Notes

- This project is tuned for a local single-user workflow.
- Runtime logs are written under `.runtime/`.
- Local MongoDB data and generated build/runtime folders are ignored in Git.

## Recommended Workflow

1. Start the tracker with `Start-Tracker.bat`
2. Use the app normally in the browser
3. Export a JSON backup occasionally
4. Stop the tracker with `Stop-Tracker.bat`

## License

ISC
