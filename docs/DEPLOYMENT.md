# Deployment

## Local

Node.js 24; `npm ci`, `npm run dev`. Vite listens on all interfaces at 5173, Colyseus at 2567. Default endpoints use the current page hostname, allowing a LAN phone to reach the same server. No frontend secret is needed. On PowerShell use `.cmd` variants if script execution is restricted.

`npm run build` typechecks and emits `apps/client/dist` and `apps/server/dist/index.js`. `npm run start -w @kitchen/server` runs the built server. Serve the client with Nginx or `npm run preview -w @kitchen/client` for local build checks.

## Docker Compose

`docker compose up --build` starts PostgreSQL, migration/seed job, Node server and Nginx. Client: port 8080. Server: 2567. Database port binds loopback only. `docker compose down` preserves the named database volume. Do not remove the volume unless you intend to erase database data.

Set `POSTGRES_PASSWORD` for deployed environments. The development password in the example is not a production credential. Database tables are currently a foundation and do not persist phase-1 gameplay.

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

The server can serve the production client and Colyseus on one origin. Build and run from the repository root in PowerShell:

```powershell
$env:VITE_SAME_ORIGIN='true'
npm.cmd run build
$env:CLIENT_DIST=(Resolve-Path apps/client/dist).Path
$env:HOST='127.0.0.1'
$env:PORT='2568'
node apps/server/dist/index.js
```

Keep that terminal open. In another terminal, run the official [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) executable:

```powershell
.\.tools\cloudflared.exe tunnel --url http://127.0.0.1:2568 --no-autoupdate
```

The Windows executable has been downloaded into `.tools` locally (not tracked); on a new machine download it from [Cloudflare downloads](https://developers.cloudflare.com/tunnel/downloads/). Share the HTTPS `trycloudflare.com` URL printed by the tunnel. Players open the same URL, choose **Chơi cùng bạn**, and join by room code or invitation. HTTPS and WSS both use this origin; no port 2567 is needed on the public URL. `VITE_SAME_ORIGIN=true` takes precedence over `VITE_SERVER_URL`; ordinary local and Docker builds retain their existing endpoint behavior.

This is a temporary link: keep the computer, server and tunnel running. Restarting the tunnel can change its URL; restarting the server loses rooms. It is not permanent hosting. To test a running deployment with the full browser suite:

```powershell
$env:E2E_BASE_URL='http://127.0.0.1:2568' # or the actual public HTTPS URL
npm.cmd run test:e2e
```

Current status: the production server is running locally on port 2568. Automated approval review blocked launching the tunnel (`blocked by policy`), so no public URL or cross-network verification has been obtained. Start the tunnel manually using the command above.

## Multiplayer local operation

Version 0.3 adds fifty executable levels; choose an unlocked shift before creating/matching a team. Public queues partition by both level and team size. The existing Docker process layout still applies. PostgreSQL seed now contains fifty levels and ten recipes; no database execution is claimed here.

For a production browser regression without keeping a background service:

```powershell
$env:VITE_SAME_ORIGIN='true'
npm.cmd run build
$env:E2E_PRODUCTION='true'
npm.cmd run test:e2e
```

Playwright starts the production server on loopback port 2569, serves the built client and stops it after the suite. Leave `E2E_BASE_URL` unset for this mode. This avoids Vite HMR interrupting active matches while testing.

Both Solo and co-op use the same Node process and ports. Open two browser profiles/contexts or devices and share the private room code, or choose the same public team size. The Compose services already serve all three room types (`solo`, `coop_private`, `coop_public`); no additional service or external account is required.

Matchmaking/presence is currently in process. Run a single server instance for local/initial hosting; do not place independent instances behind a random load balancer without configuring a shared Colyseus presence/driver and correct WebSocket routing. A process restart loses active rooms. The 20-second reconnect window covers connection loss, not process persistence. Private invite URLs for phones must use the LAN hostname/IP, not `localhost`.
