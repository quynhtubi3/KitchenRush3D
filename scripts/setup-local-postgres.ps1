$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtimeDirectory = Join-Path $repoRoot '.runtime'
$pgBin = Join-Path $repoRoot '.tools\postgresql-a2\pgsql\bin'
$initdb = Join-Path $pgBin 'initdb.exe'
$psql = Join-Path $pgBin 'psql.exe'
$dataDirectory = Join-Path $runtimeDirectory 'account-postgres-data'
$adminPasswordPath = Join-Path $runtimeDirectory 'account-postgres-admin-password.txt'
$accountConfig = Join-Path $repoRoot '.env.account.local'
$npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue

if (-not (Test-Path $initdb) -or -not (Test-Path $psql)) {
  throw "PostgreSQL 17 portable tools were not found at $pgBin."
}
if (-not $npm) {
  throw 'npm.cmd was not found. Install Node.js 24 and reopen PowerShell.'
}

function New-DatabasePassword {
  $bytes = New-Object byte[] 48
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Get-ConfiguredConnectionString {
  if (-not (Test-Path $accountConfig)) { return $null }
  foreach ($line in (Get-Content -LiteralPath $accountConfig -Encoding UTF8)) {
    if ($line -match '^DATABASE_URL=(.+)$') { return $Matches[1] }
  }
  throw '.env.account.local exists but does not contain DATABASE_URL. Preserve it and repair the file manually.'
}

function Assert-LocalConnectionString([string]$connectionString) {
  try { $uri = [Uri]$connectionString } catch { throw 'The local account DATABASE_URL is not a valid URL.' }
  if ($uri.Host -ne '127.0.0.1' -or $uri.Port -ne 55433 -or $uri.AbsolutePath -ne '/kitchen_rush') {
    throw 'The local setup script only manages 127.0.0.1:55433/kitchen_rush. It will not overwrite another database configuration.'
  }
}

function Write-AccountConfig([string]$connectionString) {
  $preserved = @{}
  $smtpKeys = @('SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASS','SMTP_FROM','ACCOUNT_PUBLIC_URL')
  if (Test-Path $accountConfig) {
    foreach ($line in (Get-Content -LiteralPath $accountConfig -Encoding UTF8)) {
      $separator = $line.IndexOf('=')
      if ($separator -le 0) { continue }
      $key = $line.Substring(0, $separator)
      if ($smtpKeys -contains $key) { $preserved[$key] = $line.Substring($separator + 1) }
    }
  }
  $defaults = @{
    SMTP_HOST = ''
    SMTP_PORT = '587'
    SMTP_SECURE = 'false'
    SMTP_USER = ''
    SMTP_PASS = ''
    SMTP_FROM = ''
    ACCOUNT_PUBLIC_URL = ''
  }
  $lines = @(
    "DATABASE_URL=$connectionString"
    'GUEST_ONLY=false'
    'AUTH_ENABLED=true'
    'CLOUD_SAVE_ENABLED=true'
    'REGISTRATION_ENABLED=false'
  )
  foreach ($key in $smtpKeys) {
    $value = if ($preserved.ContainsKey($key)) { $preserved[$key] } else { $defaults[$key] }
    $lines += "$key=$value"
  }
  $contents = $lines -join "`r`n"
  $temporaryConfig = "$accountConfig.tmp"
  Set-Content -LiteralPath $temporaryConfig -Value $contents -Encoding ASCII -NoNewline
  Move-Item -LiteralPath $temporaryConfig -Destination $accountConfig -Force
}

New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
$connectionString = Get-ConfiguredConnectionString
$isInitialized = Test-Path (Join-Path $dataDirectory 'PG_VERSION')

if (-not $connectionString) {
  if (-not (Test-Path $adminPasswordPath)) {
    if ($isInitialized) {
      throw "The local PostgreSQL cluster exists but its admin secret file is missing. No files were changed; restore $adminPasswordPath from your backup or use a DBA to recover it."
    }
    $adminPassword = New-DatabasePassword
    Set-Content -LiteralPath $adminPasswordPath -Value $adminPassword -Encoding ASCII -NoNewline
  } else {
    $adminPassword = (Get-Content -LiteralPath $adminPasswordPath -Raw -Encoding ASCII).Trim()
  }

  $appPassword = New-DatabasePassword
  $connectionString = "postgres://kitchen_app:$appPassword@127.0.0.1:55433/kitchen_rush"
  Assert-LocalConnectionString $connectionString
  Write-AccountConfig $connectionString

  if (-not $isInitialized) {
    if (Test-Path $dataDirectory) {
      throw "The data directory exists without a PostgreSQL PG_VERSION marker. It was left untouched: $dataDirectory"
    }
    New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
    $pwFile = Join-Path $runtimeDirectory "initdb-$([Guid]::NewGuid().ToString('N')).pw"
    try {
      Set-Content -LiteralPath $pwFile -Value $adminPassword -Encoding ASCII -NoNewline
      & $initdb -D $dataDirectory --username=postgres --auth-local=trust --auth-host=scram-sha-256 "--pwfile=$pwFile" --encoding=UTF8
      if ($LASTEXITCODE -ne 0) { throw 'initdb failed. The partial data directory was preserved for inspection.' }
      $isInitialized = $true
    } finally {
      Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue
    }
  }
} else {
  Assert-LocalConnectionString $connectionString
  if (-not $isInitialized) {
    throw "DATABASE_URL is configured, but the local data directory is not initialized: $dataDirectory"
  }
  if (-not (Test-Path $adminPasswordPath)) {
    Write-Host 'The database is already configured; schema setup will use the restricted game role.'
  } else {
    $adminPassword = (Get-Content -LiteralPath $adminPasswordPath -Raw -Encoding ASCII).Trim()
  }
}

& (Join-Path $PSScriptRoot 'start-local-postgres.ps1')
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Could not start the local PostgreSQL cluster.' }

if ($adminPassword) {
  $uri = [Uri]$connectionString
  $appPassword = [Uri]::UnescapeDataString($uri.UserInfo.Split(':', 2)[1])
  $sql = @"
DO `$role_setup`$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kitchen_app') THEN
    CREATE ROLE kitchen_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
`$role_setup`$;
ALTER ROLE kitchen_app WITH LOGIN PASSWORD '$appPassword' NOSUPERUSER NOCREATEDB NOCREATEROLE;
SELECT 'CREATE DATABASE kitchen_rush OWNER kitchen_app'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'kitchen_rush')
\gexec
ALTER DATABASE kitchen_rush OWNER TO kitchen_app;
"@
  $previousPgPassword = $env:PGPASSWORD
  try {
    $env:PGPASSWORD = $adminPassword
    $sql | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55433 -U postgres -d postgres
    if ($LASTEXITCODE -ne 0) { throw 'Could not provision the restricted kitchen_app database role.' }
  } finally {
    if ($null -eq $previousPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
    else { $env:PGPASSWORD = $previousPgPassword }
  }
}

$previousDatabaseUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = $connectionString
  & $npm.Source run db:migrate
  if ($LASTEXITCODE -ne 0) { throw 'Database migrations failed. Fix the reported issue and run this setup script again.' }
  & $npm.Source run db:seed
  if ($LASTEXITCODE -ne 0) { throw 'Campaign seed failed. Fix the reported issue and run this setup script again.' }
} finally {
  if ($null -eq $previousDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:DATABASE_URL = $previousDatabaseUrl }
}

Write-Host 'Local account database is ready: 127.0.0.1:55433/kitchen_rush.'
Write-Host 'The app credentials are stored in the ignored .env.account.local file; the PostgreSQL admin secret is in the ignored .runtime folder.'
Write-Host 'Public registration remains disabled until email verification and account recovery are configured.'
