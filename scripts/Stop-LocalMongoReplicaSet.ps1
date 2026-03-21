$ErrorActionPreference = "Stop"

$listener = Get-NetTCPConnection -LocalPort 27018 -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
  Write-Host "No local Mongo replica-set process found on port 27018."
  exit 0
}

Stop-Process -Id $listener.OwningProcess -Force
Write-Host "Stopped local Mongo replica-set process on port 27018."
