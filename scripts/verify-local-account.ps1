$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$accountConfig = Join-Path $repoRoot '.env.account.local'
$serverEntry = Join-Path $repoRoot 'apps\server\dist\index.js'
$clientDist = Join-Path $repoRoot 'apps\client\dist'
$runtimeDirectory = Join-Path $repoRoot '.runtime'
$port = 2571
$baseUrl = "http://127.0.0.1:$port"

if (-not (Test-Path $accountConfig)) { throw 'Run scripts/setup-local-postgres.ps1 first.' }
if (-not (Test-Path $serverEntry) -or -not (Test-Path (Join-Path $clientDist 'index.html'))) {
  throw 'Production build is missing. Run npm.cmd run build first, after stopping any live tunnel.'
}
if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
  throw "Port $port is already in use. Stop that process or choose a different verification port."
}

$databaseUrl = $null
foreach ($line in (Get-Content -LiteralPath $accountConfig -Encoding ASCII)) {
  if ($line -match '^DATABASE_URL=(.+)$') { $databaseUrl = $Matches[1]; break }
}
if (-not $databaseUrl) { throw '.env.account.local has no DATABASE_URL.' }

$environmentNames = @(
  'DATABASE_URL', 'GUEST_ONLY', 'AUTH_ENABLED', 'CLOUD_SAVE_ENABLED',
  'REGISTRATION_ENABLED', 'NODE_ENV', 'HOST', 'PORT', 'CLIENT_DIST'
)
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
  $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$serverProcess = $null
try {
  $env:DATABASE_URL = $databaseUrl
  $env:GUEST_ONLY = 'false'
  $env:AUTH_ENABLED = 'true'
  $env:CLOUD_SAVE_ENABLED = 'true'
  $env:REGISTRATION_ENABLED = 'false'
  $env:NODE_ENV = 'production'
  $env:HOST = '127.0.0.1'
  $env:PORT = "$port"
  $env:CLIENT_DIST = $clientDist

  $node = (Get-Command 'node.exe' -ErrorAction Stop).Source
  $stdoutLog = Join-Path $runtimeDirectory 'account-verify.log'
  $stderrLog = Join-Path $runtimeDirectory 'account-verify-error.log'
  $serverProcess = Start-Process -FilePath $node `
    -ArgumentList @('apps/server/dist/index.js') `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog

  $deadline = (Get-Date).AddSeconds(20)
  $health = $null
  do {
    Start-Sleep -Milliseconds 300
    try { $health = Invoke-RestMethod -Uri "$baseUrl/health" -TimeoutSec 2 }
    catch { $health = $null }
  } until (($health -and $health.accountsAvailable) -or (Get-Date) -ge $deadline)

  if (-not $health -or $health.status -ne 'ok' -or -not $health.accountsConfigured -or
      -not $health.accountsAvailable -or -not $health.authEnabled -or
      -not $health.cloudSaveEnabled -or $health.registrationEnabled) {
    $errorTail = if (Test-Path $stderrLog) { (Get-Content $stderrLog -Tail 20) -join "`n" } else { '' }
    throw "The account server failed its PostgreSQL/production-flag health check. $errorTail"
  }

  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $csrf = Invoke-RestMethod -Uri "$baseUrl/api/account/csrf" -WebSession $session -TimeoutSec 4
  $registrationStatus = 0
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/api/account/register" `
      -Method Post -WebSession $session `
      -Headers @{ Origin = $baseUrl; 'X-CSRF-Token' = $csrf.csrfToken } `
      -ContentType 'application/json' -Body '{}' -TimeoutSec 4 | Out-Null
    $registrationStatus = 200
  } catch {
    if ($_.Exception.Response) { $registrationStatus = [int]$_.Exception.Response.StatusCode }
    else { throw }
  }
  if ($registrationStatus -ne 403) {
    throw "Public registration must remain disabled in production; received HTTP $registrationStatus."
  }

  Write-Host 'Passed: PostgreSQL is available to the account server; auth and cloud saves are enabled.'
  Write-Host 'Passed: production public registration is blocked with HTTP 403.'
} finally {
  if ($serverProcess) { Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue }
  foreach ($name in $environmentNames) {
    if ($null -eq $previousEnvironment[$name]) {
      Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    } else {
      [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
  }
}
