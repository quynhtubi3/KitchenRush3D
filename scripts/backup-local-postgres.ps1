$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$accountConfig = Join-Path $repoRoot '.env.account.local'
$pgBin = Join-Path $repoRoot '.tools\postgresql-a2\pgsql\bin'
$pgDump = Join-Path $pgBin 'pg_dump.exe'

if (-not (Test-Path $accountConfig)) {
  throw 'Local account settings are missing. Run scripts/setup-local-postgres.ps1 first.'
}
if (-not (Test-Path $pgDump)) { throw "pg_dump.exe was not found at $pgDump." }

$connectionString = $null
foreach ($line in (Get-Content -LiteralPath $accountConfig -Encoding ASCII)) {
  if ($line -match '^DATABASE_URL=(.+)$') { $connectionString = $Matches[1]; break }
}
if (-not $connectionString) { throw '.env.account.local has no DATABASE_URL.' }
$databaseUri = [Uri]$connectionString
if ($databaseUri.Host -ne '127.0.0.1' -or $databaseUri.Port -ne 55433 -or $databaseUri.AbsolutePath -ne '/kitchen_rush') {
  throw 'The local backup script only manages 127.0.0.1:55433/kitchen_rush.'
}

& (Join-Path $PSScriptRoot 'start-local-postgres.ps1')
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Could not start local account PostgreSQL.' }

$backupDirectory = Join-Path $repoRoot '.runtime\account-backups'
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$backupFile = Join-Path $backupDirectory "kitchen-rush-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"
$previousPgPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = [Uri]::UnescapeDataString($databaseUri.UserInfo.Split(':', 2)[1])
  & $pgDump --format=custom --no-owner --host=127.0.0.1 --port=55433 --username=kitchen_app --dbname=kitchen_rush --file=$backupFile
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed. No backup was reported as complete.' }
} finally {
  if ($null -eq $previousPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  else { $env:PGPASSWORD = $previousPgPassword }
}

if (-not (Test-Path $backupFile) -or (Get-Item -LiteralPath $backupFile).Length -eq 0) {
  throw 'pg_dump returned without creating a non-empty backup.'
}
Write-Host "Local PostgreSQL backup created: $backupFile"
Write-Host 'The dump is not encrypted by this script. Move a copy to a private, separate drive or storage location and protect that copy.'
