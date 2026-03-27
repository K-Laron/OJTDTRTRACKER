$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $root ".runtime"
$pidFile = Join-Path $runtimeDir "tracker-pids.json"
$serverLog = Join-Path $runtimeDir "server.log"
$viteLog = Join-Path $runtimeDir "vite.log"
$localMongoUri = "mongodb://127.0.0.1:27018/ojt_dtr_tracker?replicaSet=rs0"

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

function Test-PortListening {
  param([int]$Port)

  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Wait-PortListening {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortListening -Port $Port) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }

  return $false
}

& (Join-Path $PSScriptRoot "Start-LocalMongoReplicaSet.ps1")

$started = [ordered]@{
  startedAt = (Get-Date).ToString("o")
  backendPid = $null
  frontendPid = $null
}

if (-not (Test-PortListening -Port 5000)) {
  $backend = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "set `"MONGODB_URI=$localMongoUri`" && set `"PORT=5000`" && node server.js 1>> `"$serverLog`" 2>>&1" `
    -WorkingDirectory (Join-Path $root "server") `
    -WindowStyle Hidden `
    -PassThru
  $started.backendPid = $backend.Id
}

if (-not (Test-PortListening -Port 5173)) {
  $frontend = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run dev 1>> `"$viteLog`" 2>>&1" `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -PassThru
  $started.frontendPid = $frontend.Id
}

$started | ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8

if (Wait-PortListening -Port 5173 -TimeoutSeconds 30) {
  Start-Process "http://localhost:5173" | Out-Null
}
