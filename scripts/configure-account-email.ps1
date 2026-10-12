param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$accountConfig = Join-Path $repoRoot '.env.account.local'
if (-not (Test-Path $accountConfig)) {
  throw 'Local account settings are missing. Run scripts/setup-local-postgres.ps1 first.'
}

$values = @{}
foreach ($line in (Get-Content -LiteralPath $accountConfig -Encoding UTF8)) {
  $separator = $line.IndexOf('=')
  if ($separator -gt 0) { $values[$line.Substring(0, $separator)] = $line.Substring($separator + 1) }
}

$hostName = (Read-Host 'SMTP host name [smtp.gmail.com]').Trim()
if (-not $hostName) { $hostName = 'smtp.gmail.com' }
if (-not $hostName -or $hostName.Contains('=') -or $hostName.Contains("`n")) { throw 'SMTP host name is invalid.' }
$portText = (Read-Host 'SMTP port (465 for implicit TLS, or 587 for STARTTLS) [465]').Trim()
if (-not $portText) { $portText = '465' }
$port = 0
if (-not [int]::TryParse($portText, [ref]$port) -or $port -lt 1 -or $port -gt 65535) { throw 'SMTP port must be between 1 and 65535.' }
$secureText = (Read-Host 'Use implicit TLS? true for port 465, false for port 587 [true]').Trim().ToLowerInvariant()
if (-not $secureText) { $secureText = 'true' }
if ($secureText -notin @('true','false')) { throw 'Implicit TLS must be true or false.' }
$user = (Read-Host 'SMTP login/user name').Trim()
$from = (Read-Host 'Sender address (for example Kitchen Rush <game@example.com>)').Trim()
$currentOrigin = $values['ACCOUNT_PUBLIC_URL']
$originDefault = if ($currentOrigin) { $currentOrigin } else { 'auto' }
$publicUrlText = (Read-Host "HTTPS origin, or auto for TryCloudflare Quick Tunnel [$originDefault]").Trim().TrimEnd('/')
if (-not $publicUrlText) { $publicUrlText = $originDefault }
if ($publicUrlText -ne 'auto') {
  try { $publicUrl = [Uri]$publicUrlText } catch { throw 'Public origin is not a valid HTTPS URL.' }
  if ($publicUrl.Scheme -ne 'https' -or $publicUrl.UserInfo -or $publicUrl.Query -or $publicUrl.Fragment -or $publicUrl.AbsolutePath -ne '/') {
    throw 'Public origin must be an HTTPS root URL without path, query, or fragment.'
  }
}
if (-not $user -or -not $from -or $user.Contains("`n") -or $from.Contains("`n")) { throw 'SMTP user and sender address are required.' }

$securePassword = Read-Host 'SMTP password/app password (entered locally; never shown)' -AsSecureString
$pointer = [IntPtr]::Zero
try {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $password = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) -replace '\s', '')
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
if (-not $password -or $password.Contains("`r") -or $password.Contains("`n")) { throw 'SMTP password must be a non-empty single-line value.' }

$values['SMTP_HOST'] = $hostName
$values['SMTP_PORT'] = [string]$port
$values['SMTP_SECURE'] = $secureText
$values['SMTP_USER'] = $user
$values['SMTP_PASS'] = $password
$values['SMTP_FROM'] = $from
$values['ACCOUNT_PUBLIC_URL'] = if ($publicUrlText -eq 'auto') { 'auto' } else { $publicUrl.GetLeftPart([UriPartial]::Authority) }
$values['REGISTRATION_ENABLED'] = 'false'

$keys = @('DATABASE_URL','GUEST_ONLY','AUTH_ENABLED','CLOUD_SAVE_ENABLED','REGISTRATION_ENABLED','SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASS','SMTP_FROM','ACCOUNT_PUBLIC_URL')
$contents = foreach ($key in $keys) {
  if ($values.ContainsKey($key)) { "$key=$($values[$key])" }
}
$temporaryConfig = "$accountConfig.tmp"
Set-Content -LiteralPath $temporaryConfig -Value ($contents -join "`r`n") -Encoding ASCII -NoNewline
Move-Item -LiteralPath $temporaryConfig -Destination $accountConfig -Force
Write-Host 'SMTP settings saved to the ignored local account config. Public registration remains disabled.'
if ($values['ACCOUNT_PUBLIC_URL'] -eq 'auto') {
  Write-Host 'Quick Tunnel mode enabled: action links use the HTTPS trycloudflare.com host of each request. Links expire if that tunnel URL changes.'
} else {
  Write-Host 'Using the configured HTTPS origin for verification and password-reset links.'
}
