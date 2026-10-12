# Account & persistence foundation — Phase 1

## Scope and rollout state

This phase adds optional registered identities and server-side campaign saves while retaining the local Guest flow. It does not add currency rewards, purchases, shop, inventory, cosmetics progression, achievements, friends or leaderboards. Existing Guest play does not require PostgreSQL, and database/auth outages do not block Solo or Multiplayer; a match receives a server-managed identity only when its session cookie can be validated.

Production registration remains off by default. When an operator explicitly enables it, the server requires SMTP configuration and an HTTPS public origin. New accounts must confirm a one-time 30-minute email link before login. Password-reset links are also single-use and 30 minutes; completing a reset revokes every session. Verification/reset requests return generic accepted responses so they do not disclose whether an email is registered. Tokens are SHA-256 digests at rest and are placed in URL fragments, not HTTP query strings. A mail scanner can open the page but cannot consume a token: the user must explicitly confirm through a CSRF-protected POST. Delivery failure is logged without recipient/token and can be retried through the resend action.

## Identity and sessions

New accounts use a normalized, case-insensitive email and a separately validated display name. Existing username accounts remain login-compatible during the migration. The stable UUID is the identity; display name and email are presentation/contact values. The profile also stores creation time, last-played time and the baseline chef appearance.

Passwords are hashed with Node.js `scrypt` (N=32768, r=8, p=1, 64-byte output) and a random salt. Session tokens are random opaque values; only their SHA-256 digests are stored. The browser receives an HttpOnly, SameSite=Lax cookie, Secure on HTTPS, expiring after 30 days. Sessions can be revoked at logout or password change; password change requires the current password and retains only the active session. Login errors are generic and auth endpoints share a bounded per-IP rate limiter.

Cookie-authenticated writes require both an exact allowed `Origin` and a matching random double-submit CSRF cookie/header. Same-origin production is the default. Separate API origins must be listed explicitly in `ACCOUNT_ALLOWED_ORIGINS`. The client keeps the CSRF value in memory and never stores an auth session token in localStorage. The local Guest continuity token is a distinct identity proof, not an account session.

## HTTP API

All account responses use `Cache-Control: no-store`.

| Method and path                             | Purpose                                                                                                               |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GET /api/account/status`                   | Reports account service, auth, registration and cloud-save flags and database availability.                           |
| `GET /api/account/csrf`                     | Issues the CSRF cookie and returns its one-time-to-page-use value.                                                    |
| `POST /api/account/guest`                   | Creates or resumes a server Guest session; legacy browser progress is accepted only when explicitly selected.         |
| `POST /api/account/register`                | Creates an email account or upgrades the current Guest identity, when registration is enabled.                        |
| `POST /api/account/verification/request`    | Sends or resends a verification link without disclosing account existence.                                            |
| `POST /api/account/verification/confirm`    | Consumes a verification token, merges this browser's Guest progress and starts a session.                             |
| `POST /api/account/password-reset/request`  | Requests a password-reset email with a generic response.                                                              |
| `POST /api/account/password-reset/complete` | Consumes a reset token, changes the password and revokes all sessions.                                                |
| `POST /api/account/login`                   | Authenticates email (and migration-period legacy username) with generic failures; can merge the current server Guest. |
| `POST /api/account/logout`                  | Revokes the current session and clears its cookie.                                                                    |
| `POST /api/account/password`                | Changes password after checking the current password and revokes other sessions.                                      |
| `GET /api/account/me`                       | Reads the current profile and campaign progress, optionally confirming a persisted match ID.                          |

There is intentionally no client API that writes a score, stars, unlock, match result or progress row.

## Cloud-save authority

Only Solo/Co-op Colyseus rooms submit results generated by the server simulation. One SQL transaction records the match, distinct participants and per-level aggregates. Unique match/participant keys make retries idempotent; the durable retry journal is enabled only with `CLOUD_SAVE_ENABLED`. Restaurant ID is stored with each progress row, while level ID remains the stable key tied to seeded campaign content. Best score/stars/completion are aggregates; Guest localStorage is never trusted as a server result.

An account's unlocks are derived from server-confirmed completed levels. Guests can play even if the database is offline. If an authenticated session cannot be read during an outage, that match proceeds as Guest and is not falsely reported as cloud-saved.

## Configuration

The checked-in example is Guest-only:

```dotenv
GUEST_ONLY=true
AUTH_ENABLED=false
REGISTRATION_ENABLED=false
CLOUD_SAVE_ENABLED=false
```

For local development and existing account-E2E compatibility, non-production registration keeps the immediate test flow. Production registration requires all of `GUEST_ONLY=false`, `AUTH_ENABLED=true`, `CLOUD_SAVE_ENABLED=true`, `REGISTRATION_ENABLED=true`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and an HTTPS-root `ACCOUNT_PUBLIC_URL`. On the Windows host use [Local Account Hosting](LOCAL_ACCOUNT_HOSTING.md): its config tool prompts for the SMTP secret locally, and its launcher leaves registration off unless `-EnableRegistration` is passed. Do not set `NODE_ENV=development` on a public server.

## Tests and known gaps

`tests/account-foundation.test.ts` covers email/display-name/password input and CSRF/origin validation. `tests/postgres-account.integration.test.ts` and `apps/server/tests/account-match.integration.test.ts` exercise PostgreSQL transactions, match persistence, identity merge, expiry, revocation, password change and reconnect. `tests/e2e/account.spec.ts` exercises browser registration/login/logout, multi-device identity, generic credential failure and the 429 rate limit when `E2E_ACCOUNT_DATABASE_URL` is supplied.

PostgreSQL integration tests cover pending registration, blocked pre-verification login, one-use verification, delayed Guest merge, one-use password reset and session revocation. In the current local setup, unit/regression and isolated database integration passed; browser E2E for the new production email flow and delivery to a real Gmail inbox have not been run. The local player's database has migration 006 applied but still has zero profiles. MFA, account deletion/export, privacy controls, cross-process rate limiting, automated off-device backups, restore drills and a security review remain future work. Production registration remains disabled on this PC until Gmail SMTP credentials and a stable HTTPS origin are locally configured and verified.
