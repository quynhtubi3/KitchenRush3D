# Pass 5 — Retina resolution and device readiness

2026-10-12 update: [Chaotic Pop Pass 2](CHAOTIC_POP_PASS2_IMPLEMENTATION.md) supersedes the render/effect descriptions below. Resolution policy is preserved; touch Balanced now targets 30 FPS with a 512px Poisson shadow map at 10 Hz, Low 24 FPS/contact shadows, High 60 FPS/768px blurred shadows. Touch effects are capped at 12 (Low 6, Reduced Motion 0). Hidden tabs stop the render loop; buffer preservation and unused stencil are disabled. Worktable feet now reach the floor, cast shadows and share one soft contact batch. The original Pass 5 verification numbers below are historical. Physical iPhone sharpness, sustained performance and temperature acceptance remain open.

2026-10-09. Priority 0 implemented and Chromium-tested; **the iPhone blur fix is not yet accepted on physical Safari devices**. Broader Pass 5 optimization remains incomplete.

## Root cause found in code

The old Standard formula was `min(2, max(1, devicePixelRatio / 1.5))`; Low always selected hardware scaling 2. Babylon divides CSS dimensions by hardware scaling. At DPR 3 both modes therefore produced a buffer at **0.5 CSS pixels**, not Retina resolution. A 390×530 CSS canvas could render at 195×265 and upscale to the display. Engine construction did not enable automatic device-ratio adaptation. This is a concrete undersampling bug consistent with the reported iPhone blur, not proof it is the only Safari issue.

No FXAA/TAA or blur postprocessing is configured. Existing PBR textures/filtering and camera framing are unchanged. HTML HUD resolution is independent of WebGL. The viewport already declares device width, initial scale 1 and viewport-fit=cover.

## Resolution policy

| Profile                                         | Auto pixels / CSS pixel, capped by DPR | Pixel budget | Effects                             |
| ----------------------------------------------- | -------------------------------------- | ------------ | ----------------------------------- |
| Low                                             | 1.5                                    | 3 million    | Shadows off; pooled VFX capped at 6 |
| Balanced (default; stored as legacy `standard`) | 2                                      | 3 million    | Existing shadows and VFX cap 24     |
| High                                            | 3                                      | 6 million    | Existing shadows and VFX cap 24     |

Hardware scaling is **1 / effective scale**. The policy never automatically goes below CSS 1×. Large viewports are constrained by pixel budget down to that floor (a CSS canvas itself larger than the budget retains 1×). A separate sharpness selector provides Auto, explicit CSS 1× comparison/energy saving, or Retina up to 3× within the profile budget. High currently improves resolution only; additional shadow/geometry LOD tiers are not implemented.

ResizeObserver, orientation/window resize, graphics settings and WebGL context restoration reapply the policy from actual canvas CSS dimensions. Preserved old Low preferences stay Low, but no longer render at half CSS size. Existing Guest progress keys are untouched. There is no automatic FPS-driven resolution reduction: adaptive scaling is intentionally not enabled before physical sharpness/FPS measurements establish safe limits.

## Local diagnostics

Settings → **Render diagnostics (local only)** toggles a pointer-transparent panel. It reports CSS dimensions, WebGL buffer dimensions, DPR, hardware scaling, effective scale, profile/sharpness, FPS/frame duration, rolling mean/p95/p99 (last 240 rendered frames), permitted Babylon WebGL info and camera zoom. Data is not uploaded. Context loss/restoration is also recorded on the canvas `data-context-state`. Frame percentiles include stalls and are not GPU timings. Existing `data-render-stats` retains draw calls/triangles/resources; `data-resolution-stats` exposes resolution values for browser checks.

Pooled effect materials are prewarmed during kitchen creation to avoid first-use material allocation in animation. Existing batching, geometry caching, pooling and disposal remain intact. No geometry/texture detail was removed to offset Retina cost.

## Evidence

- Typecheck/build passed. Unit/integration: **286 passed, 4 PostgreSQL tests skipped**; format check and `git diff --check` passed.
- Full production E2E: **33 passed, 1 Account test skipped, 0 failed in 29.6 minutes**. The suite covered Solo serve/wash/win, actual two-browser Multiplayer, reconnect, joystick/touch, Settings without pausing, warning feedback, camera layouts, campaign selection and gameplay captures in all five restaurants on desktop/mobile.
- DPR=3 browser test passed, checking actual backing/CSS ratios at 1×/2×/3× and orientation change. This is Chromium software rendering, **not Safari iPhone acceptance**.
- Same paused Little Sun scene: [CSS 1×](screenshots/pass5/retina-css.png), [Balanced Retina](screenshots/pass5/retina-auto.png), [High sharpness](screenshots/pass5/retina-native.png). At 390×530 CSS the buffers are 390×530, 780×1060 and 1170×1590 respectively. The last image uses explicit high sharpness with the Balanced pixel budget; it is not a GPU performance comparison.
- Captured 45 matched scenes across five restaurants × desktop/portrait/landscape × Low/Balanced/High: [screenshots](screenshots/pass5/audit/). The [measurement manifest](screenshots/pass5/audit/measurements.json) records actual buffer dimensions, five-second RAF mean/p95/p99/FPS, Babylon draw calls/triangles/mesh/material and byte estimates, heap when exposed, page/menu and match-entry time, DPR and WebGL renderer.
- All performance-matrix frames came from Chromium SwiftShader. It rendered at only a few FPS in many cases; those readings describe this software renderer and cannot predict Safari/mobile GPU performance. `performance.memory` is Chromium-specific and is null when unsupported. Geometry/texture bytes remain estimates, not GPU allocation metrics.
- SwiftShader audit summary (15 five-second windows per profile, each averaged across the 5 restaurants and 3 viewport classes):

  | Profile  | Mean of per-scene FPS | Per-scene p95 frame-time range | Draw-call range |      Triangles |
  | -------- | --------------------: | -----------------------------: | --------------: | -------------: |
  | Low      |                   3.5 |                   167–1,333 ms |         177–199 | 91,750–107,044 |
  | Balanced |                   4.4 |                     283–650 ms |         273–310 | 91,750–107,044 |
  | High     |                   3.4 |                     450–933 ms |         273–310 | 91,750–107,044 |

  These results show Low disables shadow work and High raises pixel cost while both leave geometry unchanged; the software renderer is too slow and variable to estimate handset FPS. They are a measured profile baseline, not a before/after speedup. Across restaurant changes, the scene reported 215–237 meshes and 129–206 materials. The manifest also records estimated geometry/texture bytes and Chromium heap; those do not include accurate GPU allocation.

- Main JS bundle: Pass 4 1,261.06 kB / gzip 343.18 kB → current 1,263.83 kB / gzip 344.10 kB. The existing >500 kB warning remains; no bundle optimization gain is claimed.

## Confirm on iPhone 13 and iPhone 14 Pro Max

1. Serve the new production build over the LAN or HTTPS using [deployment instructions](DEPLOYMENT.md). Ensure Safari loads the new assets, not an old tab. Keep `GUEST_ONLY=true`.
2. Open Settings, choose Balanced, Auto sharpness, enable diagnostics. Record phone, iOS version and orientation manually. Do not infer DPR from model name; read the panel.
3. Start Little Sun level 1. Record CSS size, buffer size, DPR and effective scale. At DPR≥2 on the usual phone canvas expect about 2× buffer/CSS, hardware scaling 0.5. Low should normally be 1.5×, not 0.5×. Budgets can cap unusually large canvases.
4. Compare the same paused scene at CSS 1×, Auto and high sharpness. Inspect chef outline, held ingredients, cooker edges and floor. HTML text should remain equally sharp. Capture actual Safari screenshots with diagnostics.
5. Rotate both ways, resume, use joystick and tap stations, open Settings while a second client continues playing. Check buffer/CSS ratios update and picking remains aligned.
6. Test Low and Reduced Motion, background Safari for 30 seconds, return/reconnect, and play for 10 minutes. Record FPS, mean/p95/p99, heat, battery behavior and touch responsiveness. Safari may not expose heap/RAM; record unavailable rather than infer it.
7. Report whether blur is resolved on **each** phone and the measured sharpness/performance tradeoff. Until then the status is “resolution bug corrected in code; physical-device confirmation pending.” No 30/60 FPS claim.

## Outstanding Pass 5 work

- Physical-device performance matrix, four-player stress, hidden-tab stability and repeated-round resource growth measurements. Current 45-row measurements are only the software-rendered profile baseline and do not establish a post-optimization gain.
- Controlled geometry LOD, thin instancing, more static batching/material reduction, offscreen animation scheduling and priority-based VFX allocation.
- Bundle splitting/lazy restaurant modules and loading improvement measurements.
- Adaptive scaling with explicit opt-out, hysteresis and a physically validated sharpness floor; currently resolution is stable and manually chosen.
- Actual Safari/iOS context loss/recovery and device thermals/RAM. Chromium tests alone cannot verify these.

These are not marked complete merely because resolution tests pass. Priority 0 increases GPU pixel cost intentionally; performance tuning must retain readable world rendering.
