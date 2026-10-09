# Test plan

## Guest settings milestone

Guest 4.2 adds `tests/mobile-feedback.test.ts`: eight input directions, neutral/invalid input, camera mapping, actual server move execution, blocked corners, station range, stored control mode and snapshot warning thresholds/deduplication. `tests/e2e/mobile-controls.spec.ts` sends Chromium touch events to the joystick in portrait/landscape, verifies authoritative position changes and release stopping, interacts via the large button, switches back to tap and verifies real cooker/customer warnings without changing the clock. Multiplayer regression pairs desktop with a touch-context joystick player. Physical iOS/Android and notch hardware are still manual verification targets.

Manual Guest 4.2: enable joystick in Settings on a touch device; drag in eight directions near walls, release/cancel, rotate the phone while dragging, and background/restore the tab. Check the chef stops after the current tile segment. Carry one plate, press the nearby rack action and check it puts the plate back once. Open Settings during co-op and verify teammates keep playing. Leave a cooked item on the stove to observe readiness and the final five-second burn warning; leave a waiting customer to observe its warning. Repeat with mute, separate volume levels and Reduced Motion. Verify safe-area and reachability on actual notched portrait/landscape devices before claiming device coverage.

`tests/preferences.test.ts` checks recovery from corrupt browser storage, volume bounds and explicit reduced-motion overrides. `tests/audio.test.ts` uses a Web Audio test double to check autoplay gating, separate gain channels, mute/hidden-tab suppression and missing audio support; it does not assess listening quality. `tests/guest-mode.test.ts` checks that explicit Guest mode avoids a DB pool and that account mode does not silently downgrade when its database fails.

Production browser checks: `npx playwright test tests/e2e/settings.spec.ts tests/e2e/game.spec.ts tests/e2e/multiplayer.spec.ts` with `E2E_PRODUCTION=true` after building with `VITE_SAME_ORIGIN=true`. Settings tests use desktop and 390×844 touch contexts, save/reload preferences, switch quality while playing and verify gameplay continues. Multiplayer also opens Settings on one client and checks the other client's timer continues and preferences stay independent. Listen manually to all six procedural music motifs; physical-device sound/GPU quality is not established by automated tests.

Account/Economy/Social are deferred by user request; database suites remain separate and skipped without their explicit test URLs.

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

## Guest 4.3 visual regression

- `tests/art.test.ts` checks thin/large rounded geometry bounds, finite normals and front-face winding; cached geometry must survive repeated translated mesh merges without mutation. Builds all 28 non-diner ingredient/preparation variants and all station variants across the 50 immutable layouts with Babylon NullEngine. This checks model construction, not image quality.
- `tests/e2e/campaign.spec.ts` opens all 50 authored shifts and prepares/serves a real dish per restaurant, with production Colyseus snapshots. Its timeout includes ten room rebuilds on software WebGL.
- `tests/e2e/visual-pass.spec.ts` captures live standard-quality desktop/mobile gameplay for all five restaurants. Desktop assembles a real dish. Pixel sampling rejects empty frames, page errors fail the test, and idle mesh/material samples bound resource growth. HUD-hidden desktop views are separately labelled art inspection images, not normal gameplay UI.
- Reuse Solo win/wash/reload, mobile touch/joystick/near-burn warnings, Settings, reconnect and two-client coordination suites. No test inserts a gameplay snapshot or bypasses server ownership. Campaign unlocks are a navigation fixture only.
- Browser screenshots and FPS are Chromium SwiftShader emulation, not evidence of real phone GPU/thermal performance. NullEngine does not prove shader output. Human review of all ten normal screenshots remains necessary; visual taste is not an automated assertion.

```powershell
$env:GUEST_ONLY='true'
$env:VITE_SAME_ORIGIN='true'
npm.cmd run build
npm.cmd test
$env:E2E_PRODUCTION='true'
npm.cmd run test:e2e
npm.cmd run format:check
```

For just the reproducible art capture: `npx.cmd playwright test tests/e2e/visual-pass.spec.ts` with `E2E_PRODUCTION=true` after building. Files are written under `docs/screenshots/*-43-*`; stats JSON documents its software-renderer provenance.
