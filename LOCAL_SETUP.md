# Local Setup

This file is a workspace supplement for running the optional local Mongo replica set and understanding how it interacts with the launcher scripts.

## What The Local Mongo Helper Actually Does

The helper script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-LocalMongoReplicaSet.ps1
```

will:

1. Create `mongo\data` and `mongo\log`
2. Start `mongod.exe` with `mongo/mongod.local.cfg`
3. Listen on `127.0.0.1:27018`
4. Initialize or verify replica set `rs0` through `scripts/ensure-local-mongo-rs.mjs`

Stop it with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Stop-LocalMongoReplicaSet.ps1
```

## Important Backend Note

Starting the local replica set by itself does not automatically switch the backend to use it.

The backend uses `server/.env` when present, or falls back to:

```text
mongodb://localhost:27017/ojt_dtr_tracker
```

If you want the backend to use the workspace-local replica set, set your local `server/.env` to something like:

```text
MONGODB_URI=mongodb://127.0.0.1:27018/ojt_dtr_tracker?replicaSet=rs0
PORT=5000
```

## Launcher Behavior

The full launcher flow is different from starting the Mongo helper directly.

- `.\Start-Tracker.bat` runs `scripts/Start-TrackerServices.ps1`
- `scripts/Start-TrackerServices.ps1` always starts the local Mongo helper first
- that same launcher then forces the backend process to use:

```text
mongodb://127.0.0.1:27018/ojt_dtr_tracker?replicaSet=rs0
```

This means:

- starting `Start-Tracker.bat` already points the backend at the workspace-local replica set
- starting only `Start-LocalMongoReplicaSet.ps1` does not change your backend connection by itself
- starting `node server.js` manually still uses `server/.env` or the default `mongodb://localhost:27017/ojt_dtr_tracker`

## Verification

This should report that replica set `rs0` is writable:

```powershell
$env:MONGO_ADMIN_URI="mongodb://127.0.0.1:27018/admin?directConnection=true"
$env:MONGO_RS_HOST="127.0.0.1:27018"
node .\scripts\ensure-local-mongo-rs.mjs
```

## Suggested Checks

After local setup changes:

```powershell
npm test
npm run build
```
