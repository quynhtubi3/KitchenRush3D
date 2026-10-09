# Guest 4.3 / Pass 4 — Animation and mobile readability

2026-10-09. This is a procedural presentation pass, not final art approval. Guest-only remains enabled for validation. Simulation, collision, recipes, balance, server authority and Guest storage are unchanged.

## Implemented

- Cooking guidance now numbers every recipe step and exposes dependency steps versus independent parallel branches, using the existing recipe graph for all restaurants. Each card lists input ingredients, equipment and duration/taps. Timed mixing stations now say “Mixing” with a percentage rather than a misleading chop count. Recipe rules, ingredient quantities and difficulty are unchanged.
- Touch chef rigs and their attached held objects render at 1.22 times their previous scale. Camera framing, tile positions and hit testing remain unchanged. Desktop uses the original scale. This increases the camera-height estimate from 40–43 px to about 49–53 px on phones; it is not a measurement of the rendered silhouette.
- Mobile primary order/inventory text is 12 px; timer/score 21 px; secondary order/time text 11 px. Nearby/priority station names are 12 px and status text 11 px, compared with 9 px on narrow portrait in Pass 3. Distant pills remain small and subdued to limit obstruction. Orders retain horizontal scrolling rather than growing over the kitchen.
- Chef walk has stronger opposing leg/arm motion, carry keeps both arms raised, idle breathes, and short reaching/working poses blend at authoritative inventory/action/station transitions. Serving reaches farther; washing uses a lower reach. These are transform poses on the existing rig, not skeletal clips. Chopping progress can trigger nearby chef hand motion even when held inventory does not change.
- Customers bob while waiting/eating, bring an arm toward their mouth while eating and tilt their head/raise an arm when patience is low. Leaving has a forward torso pose while the server exposes that state. These remain basic stylized gestures, not a complete facial-expression or locomotion system.
- Every station has three reusable effect meshes. Actual station processing/burnt state and short state-change pulses drive steam/smoke, blue wash bubbles, prep/mix orbiting flecks and gold completion/service sparkles. A short blade stroke follows server chopping progress; a small amber heat flicker occupies one stove effect slot. Existing heat materials still show cooking/ready/burnt. No effect meshes are created or destroyed in the animation loop.
- Standard mode permits at most 24 active effect meshes; Low Graphics permits 6, at most one per station; Reduced Motion disables all of them. No camera shake or additional postprocessing.
- Sound differentiates cooking/washing/mixing starts; chopping and cooking have a lower triangle-wave timbre, service rises a fifth, and burnt/loss descend. Identical cues are throttled to 90 ms. Master/Music/SFX, mute, hidden-tab silencing and interaction-gated AudioContext remain intact. Sounds are synthesized, not recordings.
- Presentation stores snapshot signatures rather than retaining mutable snapshots. Initial snapshots, level resets and gaps longer than two simulation seconds establish a baseline instead of replaying transient effects. Identical snapshots do not retrigger pulses. The main event sound also skips the first received snapshot.

## Evidence and validation

Build/typecheck passed, with the existing large client chunk warning. Unit/integration: **283 passed, 4 PostgreSQL-dependent skipped**. The final **complete production E2E suite passed: 32 passed, 1 Account test skipped, 0 failed in 22.6 minutes** (`pass4-final-e2e.log`). This covers Solo cooking/service/washing/reuse/win/progress, mobile reconnect, PC/mobile room movement, two-client cooperative cooking and synchronized score, joystick portrait/landscape, Settings, warnings, VFX/Reduced Motion, five viewport references and all ten restaurant captures. Campaign E2E selects 50 menu entries and serves a real dish in each restaurant; all 50 levels at four team sizes are completed by the simulation regression, not by browser matches.

Earlier full runs exposed a Little Sun visual timeout under SwiftShader and a WASD test sending keydown before the first playable snapshot. Visual tests now prepare food in Low Graphics, switch to Standard, and verify Standard telemetry/shadows before captures. WASD waits for the HUD and initial chef position; it passed three consecutive targeted runs before the final full suite. The final result above is one complete run, not an aggregate of reruns.

Final standard-quality capture measurements: desktop 378–393 draw calls, 122,842–133,486 triangles and 249–262 active meshes; mobile 306–320 draw calls, 101,574–113,410 triangles and 198–208 active meshes. SwiftShader reported 2–9 FPS. These figures identify substantial remaining render cost and cannot establish acceptable physical-phone performance. Phone chef camera-scale estimates are 49 px at 360×640, 53 px at 390×844 and 52 px landscape; tablet is 90 px. All five initial reference views retain 12/12 station anchors.

The new browser test records video under `test-results/pass4-video/`, captures three real cooking frames and checks the effect cap and Reduced Motion/Low Graphics behavior. A preserved [cooking recording](screenshots/pass4-after/cooking.webm) and [frame 0](screenshots/pass4-after/cooking-frame-0.png), [frame 1](screenshots/pass4-after/cooking-frame-1.png), [frame 2](screenshots/pass4-after/cooking-frame-2.png) are available. Video is local test evidence, not a frame-rate benchmark.

Viewport comparisons use the same initial Little Sun level as Pass 3:

| Viewport | Before                                                  | After                                                   |
| -------- | ------------------------------------------------------- | ------------------------------------------------------- |
| 360×640  | [Pass 3](screenshots/pass3-after/small-360x640.png)     | [Pass 4](screenshots/pass4-after/small-360x640.png)     |
| 390×844  | [Pass 3](screenshots/pass3-after/portrait-390x844.png)  | [Pass 4](screenshots/pass4-after/portrait-390x844.png)  |
| 844×390  | [Pass 3](screenshots/pass3-after/landscape-844x390.png) | [Pass 4](screenshots/pass4-after/landscape-844x390.png) |
| 768×1024 | [Pass 3](screenshots/pass3-after/tablet-768x1024.png)   | [Pass 4](screenshots/pass4-after/tablet-768x1024.png)   |

Restaurant desktop/mobile screenshots and renderer JSON are generated as `docs/screenshots/<restaurant>-43-pass4-<desktop|mobile>.*`. They cover Little Sun, Tide, Olive, Lantern and Orbit. The JSON reports draw calls, triangles, active meshes, FPS and estimated memory under Chromium SwiftShader; it does not benchmark a phone GPU.

| Restaurant | Desktop                                                 | Mobile                                                 |
| ---------- | ------------------------------------------------------- | ------------------------------------------------------ |
| Little Sun | [Gameplay](screenshots/little-sun-43-pass4-desktop.png) | [Gameplay](screenshots/little-sun-43-pass4-mobile.png) |
| Tide       | [Gameplay](screenshots/tide-43-pass4-desktop.png)       | [Gameplay](screenshots/tide-43-pass4-mobile.png)       |
| Olive      | [Gameplay](screenshots/olive-43-pass4-desktop.png)      | [Gameplay](screenshots/olive-43-pass4-mobile.png)      |
| Lantern    | [Gameplay](screenshots/lantern-43-pass4-desktop.png)    | [Gameplay](screenshots/lantern-43-pass4-mobile.png)    |
| Orbit      | [Gameplay](screenshots/orbit-43-pass4-desktop.png)      | [Gameplay](screenshots/orbit-43-pass4-mobile.png)      |

## Remaining quality work for Pass 5

- No physical Android/iPhone testing, audio listening study, safe-area hardware validation or mobile GPU benchmark has been performed. Dense simultaneous tickets/warnings and four-player clutter still need hands-on testing.
- No authored animation clips, hand-to-knife contact choreography, articulated mixer tool, facial expression system, animated exit path or elaborate fire simulation. Prep flecks and small puffs are a first feedback pass; station gestures share much of their motion.
- The short global server event stream does not carry an actor ID for every interaction. Pose feedback uses nearby station/inventory transitions, so two nearby chefs can both react to shared station progress. This does not change gameplay state.
- Larger rigs improve visibility without cropping additional stations, but can overlap adjacent props at close distances. Held-item readability and dense priority labels still need visual refinement on narrow screens.
- Low Graphics uses a deterministic station-order effect budget; busy early stations can suppress decorative effects on later ones. HUD warnings and authoritative state remain visible.

## Reproduce

```powershell
$env:GUEST_ONLY='true'
npm.cmd run build
npm.cmd test
$env:E2E_PRODUCTION='true'
npm.cmd run test:e2e
npm.cmd run format:check
```
