param(
  [switch]$SkipBuild,
  [switch]$EnableAccounts,
  [switch]$EnableRegistration
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$clientDist = Join-Path $repoRoot 'apps/client/dist'
$serverEntry = Join-Path $repoRoot 'apps/server/dist/index.js'
$cloudflared = Join-Path $repoRoot '.tools/cloudflared.exe'
$runtimeDir = Join-Path $repoRoot '.runtime'
$mode = if ($EnableAccounts) { 'account' } else { 'guest' }
$accountDatabaseUrl = $null
$accountConfigValues = @{}
$smtpEnvironmentKeys = @('SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASS','SMTP_FROM','ACCOUNT_PUBLIC_URL')

if ($EnableRegistration -and -not $EnableAccounts) {
  throw 'Public registration requires -EnableAccounts as well.'
}

function Test-ExpectedHealth($health) {
  if ($health.status -ne 'ok') { return $false }
  if ($EnableAccounts) {
    return $health.accountsConfigured -and $health.accountsAvailable -and
      $health.authEnabled -and $health.cloudSaveEnabled -and
      ([bool]$health.registrationEnabled -eq [bool]$EnableRegistration) -and
      (-not $EnableRegistration -or $health.emailDeliveryConfigured)
  }
  return -not $health.accountsConfigured -and -not $health.authEnabled -and
    -not $health.cloudSaveEnabled -and -not $health.registrationEnabled
}

if (-not (Test-Path $cloudflared)) {
  throw "cloudflared is missing at $cloudflared. See docs/DEPLOYMENT.md to install it."
}

if ($EnableAccounts) {
  $accountConfig = Join-Path $repoRoot '.env.account.local'
  if (-not (Test-Path $accountConfig)) {
    throw 'Local account settings are missing. Run scripts/setup-local-postgres.ps1 first.'
  }
  foreach ($line in (Get-Content -LiteralPath $accountConfig -Encoding UTF8)) {
    $separator = $line.IndexOf('=')
    if ($separator -le 0) { continue }
    $accountConfigValues[$line.Substring(0, $separator)] = $line.Substring($separator + 1)
  }
  $accountDatabaseUrl = $accountConfigValues['DATABASE_URL']
  if (-not $accountDatabaseUrl) { throw '.env.account.local has no DATABASE_URL.' }
  try { $databaseUri = [Uri]$accountDatabaseUrl } catch { throw 'DATABASE_URL in .env.account.local is invalid.' }
  if ($databaseUri.Host -ne '127.0.0.1' -or $databaseUri.Port -ne 55433 -or $databaseUri.AbsolutePath -ne '/kitchen_rush') {
    throw 'The -EnableAccounts launcher accepts only its dedicated local DB at 127.0.0.1:55433/kitchen_rush.'
  }
  if ($EnableRegistration) {
    foreach ($key in $smtpEnvironmentKeys) {
      if (-not $accountConfigValues[$key]) { throw "Email configuration is missing $key. Run scripts/configure-account-email.ps1 first." }
    }
    if ($accountConfigValues['SMTP_SECURE'] -notin @('true','false')) { throw 'SMTP_SECURE must be true or false.' }
    $smtpPort = 0
    if (-not [int]::TryParse($accountConfigValues['SMTP_PORT'], [ref]$smtpPort) -or $smtpPort -lt 1 -or $smtpPort -gt 65535) { throw 'SMTP_PORT is invalid.' }
    if ($accountConfigValues['ACCOUNT_PUBLIC_URL'] -ne 'auto') {
      try { $publicOrigin = [Uri]$accountConfigValues['ACCOUNT_PUBLIC_URL'] } catch { throw 'ACCOUNT_PUBLIC_URL is invalid.' }
      if ($publicOrigin.Scheme -ne 'https' -or $publicOrigin.UserInfo -or $publicOrigin.Query -or $publicOrigin.Fragment -or $publicOrigin.AbsolutePath -ne '/') {
        throw 'ACCOUNT_PUBLIC_URL must be an HTTPS root URL or auto for a TryCloudflare Quick Tunnel.'
      }
    }
  }
  & (Join-Path $PSScriptRoot 'start-local-postgres.ps1')
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Could not start local account PostgreSQL.' }
}

$npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
if (-not $npm) {
  throw 'npm.cmd was not found. Install Node.js and reopen PowerShell.'
}

$oldTunnels = @(Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match '\btunnel\b' })
if ($oldTunnels.Count -gt 0) {
  $details = $oldTunnels | ForEach-Object { "$($_.ProcessId): $($_.CommandLine)" }
  throw "A cloudflared tunnel is already running. Stop it with Ctrl+C before restarting the Guest server, so active matches are not interrupted and you use the new URL. $($details -join '; ')"
}

if (-not $SkipBuild) {
  Write-Host 'Building the production client and server for one-origin hosting...'
  $previousSameOrigin = $env:VITE_SAME_ORIGIN
  try {
    $env:VITE_SAME_ORIGIN = 'true'
    & $npm.Source run build
    if ($LASTEXITCODE -ne 0) {
      throw "Build failed with exit code $LASTEXITCODE. The tunnel was not started."
    }
  } finally {
    if ($null -eq $previousSameOrigin) {
      Remove-Item Env:VITE_SAME_ORIGIN -ErrorAction SilentlyContinue
    } else {
      $env:VITE_SAME_ORIGIN = $previousSameOrigin
    }
  }
}

if (-not (Test-Path $serverEntry) -or -not (Test-Path (Join-Path $clientDist 'index.html'))) {
  throw 'Built client/server files are missing. Run this script without -SkipBuild.'
}

$buildInputs = @("apps/server/dist/index.js:$((Get-FileHash $serverEntry -Algorithm SHA256).Hash)")
if ($EnableAccounts) {
  $connectionHasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    $connectionFingerprint = [BitConverter]::ToString(
      $connectionHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($accountDatabaseUrl))
    ).Replace('-', '')
  } finally {
    $connectionHasher.Dispose()
  }
  $buildInputs += "account-database:$connectionFingerprint"
  $configFingerprintInput = @($smtpEnvironmentKeys | ForEach-Object { "$_=$($accountConfigValues[$_])" }) -join "`n"
  $configHasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    $accountRuntimeFingerprint = [BitConverter]::ToString(
      $configHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes("registration=$([bool]$EnableRegistration)`n$configFingerprintInput"))
    ).Replace('-', '')
  } finally {
    $configHasher.Dispose()
  }
  $buildInputs += "account-runtime:$accountRuntimeFingerprint"
}
foreach ($file in (Get-ChildItem $clientDist -File -Recurse | Sort-Object FullName)) {
  $relative = $file.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
  $buildInputs += "${relative}:$((Get-FileHash $file.FullName -Algorithm SHA256).Hash)"
}
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
  $buildFingerprint = [BitConverter]::ToString(
    $sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes(($buildInputs -join "`n")))
  ).Replace('-', '')
} finally {
  $sha256.Dispose()
}
$buildManifest = Join-Path $runtimeDir "$mode-2568-build.json"
$pidManifest = Join-Path $runtimeDir "$mode-2568.pid"

$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 2568 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique)
$serverReady = $false
$startServer = $listeners.Count -eq 0

if ($listeners.Count -gt 0) {
  try {
    $page = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:2568/' -TimeoutSec 4
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:2568/health' -TimeoutSec 4
    $serverReady = $page.StatusCode -eq 200 -and
      $page.Content.Contains('Kitchen Rush 3D') -and
      (Test-ExpectedHealth $health)
  } catch {
    $serverReady = $false
  }

  if (-not $serverReady) {
    $ownerDetails = foreach ($owner in $listeners) {
      $process = Get-CimInstance Win32_Process -Filter "ProcessId = $owner" -ErrorAction SilentlyContinue
      if ($process) { "$owner ($($process.Name)): $($process.CommandLine)" } else { "$owner (process details unavailable)" }
    }
    throw "Port 2568 is occupied by a process that is not serving the expected $mode game mode. Stop it, then rerun. $($ownerDetails -join '; ')"
  }

  $trackedPid = if (Test-Path $pidManifest) { [int](Get-Content $pidManifest -Raw) } else { 0 }
  $managedOwner = $listeners.Count -eq 1 -and $trackedPid -eq [int]$listeners[0]
  $ownerProcess = if ($managedOwner) {
    Get-CimInstance Win32_Process -Filter "ProcessId = $trackedPid" -ErrorAction SilentlyContinue
  }
  $managedOwner = $managedOwner -and $ownerProcess -and
    $ownerProcess.CommandLine.Contains('apps/server/dist/index.js')
  $previousBuild = if (Test-Path $buildManifest) {
    Get-Content $buildManifest -Raw | ConvertFrom-Json
  }
  $staleBuild = -not $previousBuild -or $previousBuild.fingerprint -ne $buildFingerprint

  if ($staleBuild) {
    if (-not $managedOwner) {
      throw 'Port 2568 serves the Guest game, but it is running an older build that this launcher does not own. Stop that Node server, then rerun this script so the latest recipes and client are loaded.'
    }
    Write-Host 'The Guest build changed. Restarting its managed server so recipe and client data reload; active matches on that process will end.'
    Stop-Process -Id $trackedPid -Force
    $deadline = (Get-Date).AddSeconds(10)
    do {
      Start-Sleep -Milliseconds 250
      $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 2568 -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
    } until ($listeners.Count -eq 0 -or (Get-Date) -ge $deadline)
    if ($listeners.Count -gt 0) {
      throw 'The old Guest server did not release port 2568. Stop its Node process and rerun this script.'
    }
    $startServer = $true
  } else {
    Write-Host 'Reusing the Guest server with the current client/server build.'
  }
}

if ($startServer) {
  New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $stdoutLog = Join-Path $runtimeDir "$mode-2568-$stamp.log"
  $stderrLog = Join-Path $runtimeDir "$mode-2568-$stamp-error.log"
  $previousEnvironment = @{
    GUEST_ONLY = $env:GUEST_ONLY
    DATABASE_URL = $env:DATABASE_URL
    AUTH_ENABLED = $env:AUTH_ENABLED
    CLOUD_SAVE_ENABLED = $env:CLOUD_SAVE_ENABLED
    REGISTRATION_ENABLED = $env:REGISTRATION_ENABLED
    SMTP_HOST = $env:SMTP_HOST
    SMTP_PORT = $env:SMTP_PORT
    SMTP_SECURE = $env:SMTP_SECURE
    SMTP_USER = $env:SMTP_USER
    SMTP_PASS = $env:SMTP_PASS
    SMTP_FROM = $env:SMTP_FROM
    ACCOUNT_PUBLIC_URL = $env:ACCOUNT_PUBLIC_URL
    NODE_ENV = $env:NODE_ENV
    PORT = $env:PORT
    HOST = $env:HOST
    CLIENT_DIST = $env:CLIENT_DIST
  }
  try {
    if ($EnableAccounts) {
      $env:GUEST_ONLY = 'false'
      $env:DATABASE_URL = $accountDatabaseUrl
      $env:AUTH_ENABLED = 'true'
      $env:CLOUD_SAVE_ENABLED = 'true'
      $env:REGISTRATION_ENABLED = if ($EnableRegistration) { 'true' } else { 'false' }
      $env:NODE_ENV = 'production'
      foreach ($key in $smtpEnvironmentKeys) {
        if ($accountConfigValues.ContainsKey($key)) { Set-Item "Env:$key" $accountConfigValues[$key] }
        else { Remove-Item "Env:$key" -ErrorAction SilentlyContinue }
      }
    } else {
      $env:GUEST_ONLY = 'true'
      Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
      $env:AUTH_ENABLED = 'false'
      $env:CLOUD_SAVE_ENABLED = 'false'
      $env:REGISTRATION_ENABLED = 'false'
      foreach ($key in $smtpEnvironmentKeys) { Remove-Item "Env:$key" -ErrorAction SilentlyContinue }
    }
    $env:PORT = '2568'
    $env:HOST = '127.0.0.1'
    $env:CLIENT_DIST = $clientDist
    $node = (Get-Command 'node.exe' -ErrorAction Stop).Source
    $serverProcess = Start-Process -FilePath $node `
      -ArgumentList @('apps/server/dist/index.js') `
      -WorkingDirectory $repoRoot `
      -WindowStyle Hidden `
      -PassThru `
      -RedirectStandardOutput $stdoutLog `
      -RedirectStandardError $stderrLog
  } finally {
    foreach ($name in $previousEnvironment.Keys) {
      if ($null -eq $previousEnvironment[$name]) {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
      } else {
        Set-Item "Env:$name" $previousEnvironment[$name]
      }
    }
  }

  $deadline = (Get-Date).AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 500
    try {
      $page = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:2568/' -TimeoutSec 2
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:2568/health' -TimeoutSec 2
      $serverReady = $page.StatusCode -eq 200 -and
        $page.Content.Contains('Kitchen Rush 3D') -and
        (Test-ExpectedHealth $health)
    } catch {
      $serverReady = $false
    }
  } until ($serverReady -or (Get-Date) -ge $deadline)

  if (-not $serverReady) {
    $errorTail = if (Test-Path $stderrLog) { (Get-Content $stderrLog -Tail 20) -join "`n" } else { '' }
    throw "$mode server did not become ready on port 2568. Logs: $stdoutLog ; $stderrLog`n$errorTail"
  }

  Set-Content -Path $pidManifest -Value $serverProcess.Id -NoNewline
  @{ fingerprint = $buildFingerprint } | ConvertTo-Json | Set-Content -Path $buildManifest
  Write-Host "Started $mode server (PID $($serverProcess.Id)); logs are in .runtime."
}

Write-Host 'Game page and health check passed at http://127.0.0.1:2568/.'
if ($EnableAccounts) {
  if ($EnableRegistration) {
    Write-Host 'Account login, cloud saves, email verification, password recovery, and public registration are enabled.'
  } else {
    Write-Host 'Account login and server-owned cloud saves are enabled; public registration remains disabled.'
  }
} else {
  Write-Host 'Guest-only mode is active; no player database connection is made.'
}
Write-Host 'Starting Cloudflare Quick Tunnel. Share the HTTPS URL it prints; leave this window open.'
& $cloudflared tunnel --protocol http2 --url 'http://127.0.0.1:2568' --no-autoupdate
if ($LASTEXITCODE -ne 0) {
  throw "cloudflared exited with code $LASTEXITCODE. The $mode server remains running on port 2568."
}
