# Test plan

Run `npm test` for simulation tests. Covered: graph cycles/missing references; obstacle paths; arrival/replacement; one-item hands; raw ingredients do not spoil; simultaneous-use serialization; active chopping; passive cooking and burn; invalid assembly; direct delivery; eating/departure; dirty-seat blocking; queue admission; finite plates and wash/reuse; trash restrictions; queue capacity/patience; combo/scoring; both victory goals; idempotent finish; stars; pause; malformed movement.

Run `npm run test:e2e` after `npx playwright install chromium`. Tests use real Colyseus and a Chromium browser, no mocked score or gameplay API:

1. Main menu → cook burger through station clicks → direct delivery → dirty plate pickup → automatic washing → return plate → cook again → deliver → finish win → local best result.
2. Touch viewport 390×844 → collect plate → recipe notebook → Solo pause → reload/reconnect preserving held plate → switch to English.
3. Two isolated browser contexts → private code/lobby/Ready/host start → actual shared cooking (grill vs chopping roles) → direct delivery → reload holding a dirty plate → wash/reuse → three completed orders → Quick Chat/Emote/Ping → first vote does not end the match → second vote → identical winning result values.

Playwright stores screenshots, failure context and traces in `test-results/`. These tests do not establish physical-phone GPU performance, Safari support, PostgreSQL correctness or production scalability. Four real SDK clients are exercised by integration tests, not by four rendered browser windows.

`npm test` includes 18 original simulation tests, 8 session-rule tests and 6 integration tests. Integration tests start a real Colyseus WebSocket server on an ephemeral loopback port and use independent SDK clients, not mocked sockets. They cover public size partitioning; actual 2/3/4-player startup; capacity and late-join rejection; simultaneous pickup, placement and stove contention; host drop; cooking/reconnect with the same held item; explicit leave and actual 20-second expiry recovery; and rejection of forged score/control/free-chat messages. Session tests exercise readiness, level authorization, frozen difficulty, unanimous votes/withdrawal/disconnect/zero-active behavior and bounded sanitized signals.

For focused checks: `npx vitest run apps/server/tests/multiplayer.integration.test.ts` and `npx playwright test multiplayer.spec.ts`. The integration cleanup skips already-closed sockets; awaiting SDK `leave()` on a closed socket otherwise never resolves. Browser assertions compare result values independently of DOM line-break formatting.

Before phase 4 acceptance, test guest-account merge, authenticated permissions, concurrent purchases, ledger rollback, duplicate finish/reward grants, leaderboard grouping and privacy. No such features are claimed by phase 1.

See `PROGRESS.md` for actual command results rather than treating this plan as proof of execution.

## Phase 3

`tests/campaign.test.ts`: 50 levels × 4 team sizes, normal intents/ticks, real paths, cooking, serving, washing and plate conservation; schema/layout and sequential unlock tests. `tests/content-rules.test.ts`: malformed graphs, guest effects/introduction, host selection and frozen difficulty. Network integration also partitions by level and synchronizes a Sushi kitchen. `tests/e2e/campaign.spec.ts` loads all 50 levels in Chromium and serves one dish per cuisine; its fixture unlocks navigation only. The original Solo E2E now verifies a genuine win unlocks shift 02, leaves 03 locked, and persists after reload.

For an immutable production run: build with `VITE_SAME_ORIGIN=true`, then set `E2E_PRODUCTION=true` and run `npm run test:e2e`. Playwright owns a loopback production server at 2569 and shuts it down afterward. Do not edit content during a dev-server E2E run because HMR can restart active matches.
