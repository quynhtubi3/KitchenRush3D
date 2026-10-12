$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pgCtl = Join-Path $repoRoot '.tools\postgresql-a2\pgsql\bin\pg_ctl.exe'
$dataDirectory = Join-Path $repoRoot '.runtime\account-postgres-data'

if (-not (Test-Path $pgCtl) -or -not (Test-Path $dataDirectory)) {
  Write-Host 'Local player PostgreSQL is not installed.'
  return
}

& $pgCtl -D $dataDirectory status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Local player PostgreSQL is already stopped.'
  return
}

& $pgCtl -D $dataDirectory -m fast -w stop
if ($LASTEXITCODE -ne 0) {
  throw 'PostgreSQL did not stop cleanly.'
}
Write-Host 'Local player PostgreSQL stopped. Database files remain on this PC.'
