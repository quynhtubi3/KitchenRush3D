# Local PostgreSQL and account mode on Windows

This is a small initial host for friends, not durable production hosting. The Windows PC, Node process, PostgreSQL and Quick Tunnel must all stay running. A Quick Tunnel URL can change when cloudflared restarts.

## Prepare the local player database

The setup below creates a separate PostgreSQL 17 cluster for player data at `.runtime/account-postgres-data`, on loopback port `55433`. It does not use or modify the disposable `kitchen_a2_test` database. PostgreSQL only listens on `127.0.0.1`; do not forward port `55433` in the router or Windows Firewall. The game reaches the database locally, while remote players reach only the game over HTTPS/WSS.

On the PC that will host the game, from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-local-postgres.ps1
```

The script uses the repository's local PostgreSQL 17 portable tools, creates a `kitchen_app` role with a random password and no administrative privileges, applies all migrations, and seeds the campaign catalog. App credentials are kept in the ignored `.env.account.local`; the separate PostgreSQL admin secret is stored in the ignored `.runtime` directory. Do not copy either file into source control or share them. The database cluster remains on this PC and survives normal game restarts/reboots.

Start or stop only PostgreSQL without deleting the data:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local-postgres.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-local-postgres.ps1
```

Create a local custom-format backup:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-local-postgres.ps1
```

Backups are placed under `.runtime/account-backups`. They contain personal account data and are not encrypted by this script. Copy them to a private, separate location and protect that copy; a backup on the same disk does not protect against disk loss. Restore has not been automated or drill-tested.

## Run a public account-enabled game

First stop any old cloudflared Quick Tunnel with Ctrl+C. Then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-trycloudflare.ps1 -EnableAccounts
```

This builds the single-origin production app, starts the local PostgreSQL cluster, serves the game at `127.0.0.1:2568`, verifies `/health`, then starts cloudflared. The account mode enables login and server-authoritative cloud saves. Health should report `accountsConfigured`, `accountsAvailable`, `authEnabled` and `cloudSaveEnabled` as true, while `registrationEnabled` remains false. The regular command without `-EnableAccounts` remains Guest-only and does not connect to PostgreSQL.

If another server already owns port `2568`, stop it explicitly after ending any active matches; the launcher will not kill an unknown process. Switching between Guest and Account modes also requires stopping the current server first. Keep the Cloudflare window and host PC running while friends play. The one-process deployment loses active rooms when Node restarts.

## Configure Gmail SMTP and email links

The account server now has one-time email verification and password-reset links. New production accounts cannot sign in until their address is confirmed. Requests return a generic response so the UI does not disclose whether an address has an account; links expire after 30 minutes and can be consumed once. Password reset revokes every existing session. Guest progress stays on its current Guest profile until verification, then merges into the new account.

Gmail's SMTP host is `smtp.gmail.com`; Google documents port `465` for SSL/TLS and `587` for TLS. SMTP username is the complete Gmail/Workspace address. Use a Google App Password when the account supports it, never the Google account's normal password. Google requires 2-Step Verification for App Passwords, and some managed accounts do not offer them. See [Google's Gmail SMTP setup](https://support.google.com/a/answer/176600) and [App Password requirements](https://support.google.com/accounts/answer/185833).

On the hosting PC, run the configuration script and enter the SMTP password only in its hidden local prompt:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\configure-account-email.ps1
npm.cmd run accounts:verify-email
```

For Gmail, enter host `smtp.gmail.com`, port `465` with implicit TLS (`true`) or port `587` with STARTTLS (`false`), the full Gmail address for username, and an allowed sender address. The script removes formatting spaces from Gmail App Passwords and saves credentials to ignored `.env.account.local`; it never prints them. The SMTP check confirms connection, TLS and authentication, but cannot prove that Gmail will accept a particular From address or that mail reaches the inbox.

For a named tunnel or custom domain, enter its stable HTTPS root URL. If you use the free Quick Tunnel, enter `auto`: verification and password-reset links then use the validated `https://<current-host>.trycloudflare.com` origin from the request. This is accepted only when the request arrived through the local Cloudflare Tunnel hop and has a valid Cloudflare client-IP header; arbitrary Host headers are not used. Start the tunnel, open the URL printed by cloudflared, and register from that page. Quick Tunnel links expire after 30 minutes and stop working if the tunnel restarts and changes its URL, so keep the same tunnel running until users finish verification or reset. A named tunnel remains preferable for a shared game.

After configuration, stop the current Guest tunnel/server intentionally, then launch:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-trycloudflare.ps1 -EnableAccounts -EnableRegistration
```

The launcher refuses registration if SMTP fields or the HTTPS origin are missing/invalid, and health must report database, auth, cloud saves, email delivery and registration ready. Without `-EnableRegistration`, Account login/cloud saves can run while registration remains closed. The normal launcher remains Guest-only. Do not set `NODE_ENV=development` on a public tunnel.

This initial PC host still lacks monitored uptime, automated off-device backups, a restore drill, distributed rate limits, independent email-delivery monitoring, security review and capacity/load assessment. Gmail SMTP is suitable for a small initial group only; test real delivery and spam placement before sharing signup broadly.
