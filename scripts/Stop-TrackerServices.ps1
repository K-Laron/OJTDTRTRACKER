$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $root ".runtime"
$pidFile = Join-Path $runtimeDir "tracker-pids.json"

function Stop-TrackedProcessTree {
  param([Nullable[int]]$ProcessId)

  if (-not $ProcessId) {
    return
  }

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) {
    return
  }

  & taskkill /F /T /PID $ProcessId *> $null
}

function Stop-PortProcess {
  param([int]$Port)

  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($listenerPid in $listeners) {
    Stop-TrackedProcessTree -ProcessId $listenerPid
  }
}

if (Test-Path $pidFile) {
  try {
    $tracked = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
    Stop-TrackedProcessTree -ProcessId $tracked.backendPid
    Stop-TrackedProcessTree -ProcessId $tracked.frontendPid
  } finally {
    Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
  }
}

foreach ($port in 5000, 5173) {
  Stop-PortProcess -Port $port
}

& (Join-Path $PSScriptRoot "Stop-LocalMongoReplicaSet.ps1")
