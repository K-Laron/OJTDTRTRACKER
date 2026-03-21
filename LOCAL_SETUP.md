# Local Setup

## MongoDB transactions

This project now points at a workspace-local MongoDB instance on `127.0.0.1:27018` so transactions do not depend on changing the Windows MongoDB service.

Start the local replica set with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-LocalMongoReplicaSet.ps1
```

That script will:

1. Create workspace-local `mongo\data` and `mongo\log`
2. Start `mongod.exe` with [`mongo\mongod.local.cfg`](/C:/Users/TESS%20LARON/Desktop/OJT%20DTR%20TRACKER/mongo/mongod.local.cfg)
3. Run `scripts/ensure-local-mongo-rs.mjs` to initialize `rs0`

Stop it with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Stop-LocalMongoReplicaSet.ps1
```

## Optional Windows service route

If you want the system MongoDB service itself to become a replica set, there is also an admin-only helper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Enable-MongoReplicaSet.ps1
```

## Verification

After setup, this command should report that the replica set is writable:

```powershell
$env:MONGO_ADMIN_URI="mongodb://127.0.0.1:27018/admin?directConnection=true"
$env:MONGO_RS_HOST="127.0.0.1:27018"
node .\scripts\ensure-local-mongo-rs.mjs
```

## App checks

Recommended local validation after MongoDB replica-set setup:

```powershell
npm test
npm run build
```
