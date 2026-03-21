param(
  [string]$ConfigPath = "C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg",
  [string]$ServiceName = "MongoDB",
  [string]$ReplicaSetName = "rs0"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ConfigPath)) {
  throw "MongoDB config not found at $ConfigPath"
}

$backupPath = "$ConfigPath.codex.bak"
if (-not (Test-Path $backupPath)) {
  Copy-Item $ConfigPath $backupPath -Force
}

$content = Get-Content $ConfigPath -Raw

if ($content -match '(?m)^\s*replication:\s*$') {
  if ($content -match '(?m)^\s*replSetName:\s*') {
    $content = [regex]::Replace($content, '(?m)^(\s*replSetName:\s*).+$', "`$1$ReplicaSetName")
  } else {
    $content = [regex]::Replace($content, '(?m)^\s*replication:\s*$', "replication:`r`n  replSetName: $ReplicaSetName")
  }
} elseif ($content -match '(?m)^\s*#replication:\s*$') {
  $content = [regex]::Replace($content, '(?m)^\s*#replication:\s*$', "replication:`r`n  replSetName: $ReplicaSetName")
} else {
  if (-not $content.EndsWith("`n")) {
    $content += "`r`n"
  }
  $content += "`r`nreplication:`r`n  replSetName: $ReplicaSetName`r`n"
}

Set-Content -Path $ConfigPath -Value $content -Encoding ascii

Restart-Service -Name $ServiceName -Force
Start-Sleep -Seconds 3

& node ".\scripts\ensure-local-mongo-rs.mjs"
