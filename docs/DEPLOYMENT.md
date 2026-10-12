# Deployment

## Local

Guest remains the default and does not need a database. `GUEST_ONLY=true` disables account database connections even when `DATABASE_URL` exists. For account login/cloud saves, use a migrated database and set `GUEST_ONLY=false`, `AUTH_ENABLED=true`, and `CLOUD_SAVE_ENABLED=true`. Production registration additionally requires `REGISTRATION_ENABLED=true`, configured SMTP, and an HTTPS-root `ACCOUNT_PUBLIC_URL`; new accounts must verify email and can recover through one-use password-reset links. The Windows launcher keeps this off by default. See [Local PostgreSQL and account mode](LOCAL_ACCOUNT_HOSTING.md). Database failure does not prevent Guest Solo or Multiplayer play.

Node.js 24; `npm ci`, `npm run dev`. Vite listens on all interfaces at 5173, Colyseus at 2567. Default endpoints use the current page hostname, allowing a LAN phone to reach the same server. No frontend secret is needed. On PowerShell use `.cmd` variants if script execution is restricted.

`npm run build` typechecks and emits `apps/client/dist` and `apps/server/dist/index.js`. `npm run start -w @kitchen/server` runs the built server. Production clients default to the page origin for HTTP matchmaking and WebSocket connections. For local build checks, set `CLIENT_DIST` to the absolute `apps/client/dist` path and serve through the Node server, or use the included Nginx proxy. A standalone Vite preview needs an explicit `VITE_SERVER_URL` at build time because preview does not proxy the game server. Development still uses the page hostname at port 2567.

## Docker Compose

`docker compose up --build` starts PostgreSQL, migration/seed job, Node server and Nginx. Client: port 8080. Server: 2567. Database port binds loopback only. `docker compose down` preserves the named database volume. Do not remove the volume unless you intend to erase database data.

Set `POSTGRES_PASSWORD` for deployed environments. The development password in the example is not a production credential. Migrations 002–006 add account identity, sessions, Guest links, restaurant-scoped campaign progress, profile fields and email-action tokens. Compose defaults every account flag off. Production login/cloud save can be enabled explicitly with `GUEST_ONLY=false`, `AUTH_ENABLED=true`, and/or `CLOUD_SAVE_ENABLED=true`; signup also needs verified SMTP/HTTPS configuration and an explicit registration flag. Database execution still needs verification on a machine with Docker/PostgreSQL.

## HTTPS/WSS

Build with `VITE_SERVER_URL=https://api.example.com` exported to Vite (or in `apps/client/.env.production`). Serve the built client at `https://game.example.com` and proxy the API hostname to port 2567. Preserve the entire Colyseus path, including matchmaking HTTP endpoints and room WebSocket paths. Typical TLS reverse-proxy location:

```nginx
location / {
    proxy_pass http://127.0.0.1:2567;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 90s;
}
```

Configure certificates through your hosting provider or ACME reverse proxy. Never serve an HTTPS game with an HTTP/WS API endpoint. For a customized Docker build, add the public Vite endpoint as a build argument/environment variable before `npm run build`; no secrets belong in a `VITE_*` variable.

Health: `/health` confirms the process responds, not database health. Restarting the process loses active rooms. Production needs strict origin policy, identity/auth, match-creation rate limits, process monitoring, capacity limits, persistence, backups and load testing. These are not completed by this local vertical slice. Do not expose it as an account/economy service.

Docker and PostgreSQL execution must be verified on a machine with Docker installed.

## Temporary public link from Windows

From the repository root, the recommended one-command launcher is:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-trycloudflare.ps1
```

It builds with `VITE_SAME_ORIGIN=true`, starts or reuses the Guest production server on port 2568, checks `/` and `/health`, and only then starts cloudflared pointed at port 2568. The launcher fingerprints the built client and server. If the tracked server is still running an older build, it restarts that process so new recipes and UI are actually loaded; restarting ends any match in that process. If a manual/untracked server is stale, stop that Node process and rerun the launcher. Keep its PowerShell window open and share the HTTPS URL it prints. If an older cloudflared window is still running, press Ctrl+C there before running the launcher again; the launcher refuses to create a confusing second URL. `-SkipBuild` reuses the current client/server build.

Manual alternative:

The server can serve the production client and Colyseus on one origin. Build and run from the repository root in PowerShell:

```powershell
$env:VITE_SAME_ORIGIN='true'
npm.cmd run build
$env:GUEST_ONLY='true'
$env:CLIENT_DIST=(Resolve-Path apps/client/dist).Path
$env:HOST='127.0.0.1'
$env:PORT='2568'
node apps/server/dist/index.js
```

Keep that terminal open. In another terminal, run the official [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) executable:

```powershell
.\.tools\cloudflared.exe tunnel --protocol http2 --url http://127.0.0.1:2568 --no-autoupdate
```

The Windows executable has been downloaded into `.tools` locally (not tracked); on a new machine download it from [Cloudflare downloads](https://developers.cloudflare.com/tunnel/downloads/). Share the HTTPS `trycloudflare.com` URL printed by the tunnel. Players open the same URL, choose **Chơi cùng bạn**, and join by room code or invitation. HTTPS and WSS both use this origin; no port 2567 is needed on the public URL. `VITE_SAME_ORIGIN=true` takes precedence over `VITE_SERVER_URL`; ordinary local and Docker builds retain their existing endpoint behavior.

To prepare the separate Windows-hosted PostgreSQL cluster and start login/cloud-save mode, follow [Local PostgreSQL and account mode](LOCAL_ACCOUNT_HOSTING.md). After preparing it, stop any existing tunnel and run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-trycloudflare.ps1 -EnableAccounts`. This enables production login and server-owned cloud saves, but keeps public registration off. Add `-EnableRegistration` only after configuring SMTP and a stable HTTPS hostname. The default command above still runs Guest-only. Do not expose the PostgreSQL port or set `NODE_ENV=development` to bypass the signup gate.

This is a temporary link: keep the computer, server and tunnel running. Restarting the tunnel can change its URL; restarting the server loses rooms. It is not permanent hosting. To test a running deployment with the full browser suite:

```powershell
$env:E2E_BASE_URL='http://127.0.0.1:2568' # or the actual public HTTPS URL
npm.cmd run test:e2e
```

### iPhone reports that 3D graphics could not start

When a game link is opened inside Zalo, use Zalo's `…` menu and choose **Open in Safari**. If that action is unavailable, use **Copy game link** on the recovery screen and paste the URL into Safari. On Android, open the page in Chrome. This usually points to a browser WebGL/context issue; the recovery screen's technical details can distinguish it from other synchronous startup errors. The game cannot force an embedded browser to hand the page to Safari, and Chromium desktop checks do not verify iPhone Safari compatibility.

### Troubleshooting `Cannot GET /`

Port 2567 is the development Colyseus/API server and does not serve the client HTML. A tunnel aimed at `http://127.0.0.1:2567` can therefore reach the server but show `Cannot GET /`. For a public single-origin game, build with `VITE_SAME_ORIGIN=true`, start the production server on port 2568 with `CLIENT_DIST` pointing at `apps/client/dist`, and aim cloudflared at `http://127.0.0.1:2568` as shown above. Check `http://127.0.0.1:2568/` for the game page and `/health` for server health before starting the tunnel.

Current status (checked 2026-10-11): the production client/server build was served on loopback port 2568 in Guest mode; `/` and `/health` responded locally. This confirms the local server health, but not Safari/iPhone rendering or a complete multiplayer session. The tunnel URL is ephemeral. A manual `npm run build` does not restart a Node process that was already running; use the launcher after stopping the existing Quick Tunnel to load the new build.

## Multiplayer local operation

A2 persistence preparation is documented in [ACCOUNT_RELIABILITY_A2.md](ACCOUNT_RELIABILITY_A2.md). Guest-only deployment still requires no database. Before a future account-enabled deployment, apply migration 003 and give `MATCH_OUTBOX_DIR` a persistent, writable directory owned by one server process. It holds completed results awaiting SQL and must survive container replacement. PostgreSQL was tested only in an isolated portable local cluster; Docker/hosted database deployment remains unverified.

Campaign Pass 7 keeps fifty executable levels and adds twenty-five validated recipes; choose an unlocked shift before creating/matching a team. Public queues partition by both level and team size. The existing Docker process layout still applies. The PostgreSQL seed imports the catalog through the existing code path, but no database execution is claimed for this content change.

For a production browser regression without keeping a background service:

```powershell
$env:VITE_SAME_ORIGIN='true'
npm.cmd run build
$env:E2E_PRODUCTION='true'
npm.cmd run test:e2e
```

Playwright starts the production server on loopback port 2570, serves the built client and stops it after the suite. Leave `E2E_BASE_URL` unset for this mode. This avoids Vite HMR interrupting active matches while testing.

Both Solo and co-op use the same Node process and ports. Open two browser profiles/contexts or devices and share the private room code, or choose the same public team size. The Compose services already serve all three room types (`solo`, `coop_private`, `coop_public`); no additional service or external account is required.

Matchmaking/presence is currently in process. Run a single server instance for local/initial hosting; do not place independent instances behind a random load balancer without configuring a shared Colyseus presence/driver and correct WebSocket routing. A process restart loses active rooms. The 20-second reconnect window covers connection loss, not process persistence. Private invite URLs for phones must use the LAN hostname/IP, not `localhost`.

## Account feature flags

The default `.env.example` has all account flags disabled. The server connects to PostgreSQL only when `GUEST_ONLY` is not `true`, a `DATABASE_URL` is present, and at least one of `AUTH_ENABLED` or `CLOUD_SAVE_ENABLED` is true. Production `REGISTRATION_ENABLED` also requires a valid SMTP configuration and `ACCOUNT_PUBLIC_URL` on HTTPS. New accounts must verify email before login; password-reset tokens expire and are single-use. See [Local PostgreSQL and account mode](LOCAL_ACCOUNT_HOSTING.md) for the Gmail setup, hidden local password prompt and launcher command. Account cookies require HTTPS in public deployments. If the web app and API use separate origins, set `ACCOUNT_ALLOWED_ORIGINS` to a comma-separated exact-origin allowlist and keep credentialed CORS narrowly scoped.

For local-only testing, use an isolated database whose name contains `_test`:

```powershell
$env:DATABASE_URL='postgres://kitchen:password@127.0.0.1:5432/kitchen_test'
$env:GUEST_ONLY='false'
$env:AUTH_ENABLED='true'
$env:REGISTRATION_ENABLED='true'
$env:CLOUD_SAVE_ENABLED='true'
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

Never aim integration tests at a database containing player data. See [database schema](DATABASE_SCHEMA.md) and [Guest migration behavior](GUEST_MIGRATION.md).
