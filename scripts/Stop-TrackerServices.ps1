$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $root ".runtime"
$pidFile = Join-Path $runtimeDir "tracker-pids.json"

function Stop-TrackedProcessTree {
  param([Nullable[int]]$Pid)

  if (-not $Pid) {
    return
  }

  $process = Get-Process -Id $Pid -ErrorAction SilentlyContinue
  if (-not $process) {
    return
  }

  & taskkill /F /T /PID $Pid *> $null
}

function Stop-PortProcess {
  param([int]$Port)

  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($listenerPid in $listeners) {
    Stop-TrackedProcessTree -Pid $listenerPid
  }
}

if (Test-Path $pidFile) {
  try {
    $tracked = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
    Stop-TrackedProcessTree -Pid $tracked.backendPid
    Stop-TrackedProcessTree -Pid $tracked.frontendPid
  } finally {
    Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
  }
}

foreach ($port in 5000, 5173) {
  Stop-PortProcess -Port $port
}

& (Join-Path $PSScriptRoot "Stop-LocalMongoReplicaSet.ps1")
