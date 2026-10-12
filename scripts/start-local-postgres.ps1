param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pgBin = Join-Path $repoRoot '.tools\postgresql-a2\pgsql\bin'
$dataDirectory = Join-Path $repoRoot '.runtime\account-postgres-data'
$runtimeDirectory = Join-Path $repoRoot '.runtime'
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
$logFile = Join-Path $runtimeDirectory 'account-postgres.log'

if (-not (Test-Path $pgCtl)) {
  throw "Portable PostgreSQL 17 was not found at $pgBin. Run scripts/setup-local-postgres.ps1 on this PC or install PostgreSQL 17."
}
if (-not (Test-Path $dataDirectory)) {
  throw 'The local player database has not been initialized. Run scripts/setup-local-postgres.ps1 first.'
}

New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
& $pgCtl -D $dataDirectory status *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host 'Local player PostgreSQL is already running.'
  return
}

& $pgCtl -D $dataDirectory -l $logFile -o '"-h 127.0.0.1 -p 55433"' -w start
if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL did not start. See $logFile."
}
Write-Host 'Local player PostgreSQL is listening on 127.0.0.1:55433.'
