param(
  [string]$MongoBin = "C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe",
  [string]$ConfigPath = "$PSScriptRoot\..\mongo\mongod.local.cfg"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $MongoBin)) {
  $portableMongoBin = Join-Path $PSScriptRoot "..\.runtime\mongodb-8.3.2\mongodb-win32-x86_64-windows-8.3.2\bin\mongod.exe"
  if (Test-Path $portableMongoBin) {
    $MongoBin = $portableMongoBin
  } else {
    throw "mongod.exe not found at $MongoBin"
  }
}

if (-not (Test-Path $ConfigPath)) {
  throw "Mongo config not found at $ConfigPath"
}

$dataDir = Join-Path $PSScriptRoot "..\mongo\data"
$logDir = Join-Path $PSScriptRoot "..\mongo\log"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$listener = Get-NetTCPConnection -LocalPort 27018 -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
  Start-Process -FilePath $MongoBin -ArgumentList "--config `"$ConfigPath`"" -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 3
}

$env:MONGO_ADMIN_URI = "mongodb://127.0.0.1:27018/admin?directConnection=true"
$env:MONGO_RS_HOST = "127.0.0.1:27018"
& node ".\scripts\ensure-local-mongo-rs.mjs"
