# Guest graphics overhaul — first implementation pass

Updated 2026-10-10. This is a measured first pass over the existing Babylon scene. It does **not** complete the requested premium-art overhaul, and tests passing do not certify art quality.

## Audit and evidence

The scene already had original procedural chibi chefs, facial features, role-specific customers, layered ingredients/dishes, different station silhouettes, five cuisine environments, cached PBR materials, ACES tone mapping, warm fill/key lighting, shadows, three pooled station effects, three graphics profiles and a lazy glTF loader. There are no production GLBs and no Blender-authored models in this checkout. Earlier pass notes and the implementation details are documented in [VISUAL_PASS_1.md](VISUAL_PASS_1.md), [VISUAL_PASS_2_PLAN.md](VISUAL_PASS_2_PLAN.md), [MOBILE_GAMEPLAY_PASS_3.md](MOBILE_GAMEPLAY_PASS_3.md), [VISUAL_PASS_4.md](VISUAL_PASS_4.md), and [MOBILE_PERFORMANCE_PASS_5.md](MOBILE_PERFORMANCE_PASS_5.md).

Reviewing the new baseline captures exposed a repeated-customer silhouette (same hair on all NPCs), undersized world detail from the all-room camera, and world labels/HUD competing with counters. This pass tackles the character repetition and interaction sound first. It leaves the existing mobile HUD/camera and art systems intact.

Before and after captures use the same level per restaurant, initial live server snapshot, Standard graphics, 1440×1000 desktop / 390×844 touch viewport and Chromium SwiftShader. They are production-build captures, not mocked canvases:

| Restaurant | Before desktop                                                        | After desktop                                                       | Before mobile                                                        | After mobile                                                       | After mobile follow                                                        |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Little Sun | [Before](screenshots/graphics-overhaul-before/little-sun-desktop.png) | [After](screenshots/graphics-overhaul-after/little-sun-desktop.png) | [Before](screenshots/graphics-overhaul-before/little-sun-mobile.png) | [After](screenshots/graphics-overhaul-after/little-sun-mobile.png) | [Follow](screenshots/graphics-overhaul-after/little-sun-mobile-follow.png) |
| Tide       | [Before](screenshots/graphics-overhaul-before/tide-desktop.png)       | [After](screenshots/graphics-overhaul-after/tide-desktop.png)       | [Before](screenshots/graphics-overhaul-before/tide-mobile.png)       | [After](screenshots/graphics-overhaul-after/tide-mobile.png)       | [Follow](screenshots/graphics-overhaul-after/tide-mobile-follow.png)       |
| Olive      | [Before](screenshots/graphics-overhaul-before/olive-desktop.png)      | [After](screenshots/graphics-overhaul-after/olive-desktop.png)      | [Before](screenshots/graphics-overhaul-before/olive-mobile.png)      | [After](screenshots/graphics-overhaul-after/olive-mobile.png)      | [Follow](screenshots/graphics-overhaul-after/olive-mobile-follow.png)      |
| Lantern    | [Before](screenshots/graphics-overhaul-before/lantern-desktop.png)    | [After](screenshots/graphics-overhaul-after/lantern-desktop.png)    | [Before](screenshots/graphics-overhaul-before/lantern-mobile.png)    | [After](screenshots/graphics-overhaul-after/lantern-mobile.png)    | [Follow](screenshots/graphics-overhaul-after/lantern-mobile-follow.png)    |
| Orbit      | [Before](screenshots/graphics-overhaul-before/orbit-desktop.png)      | [After](screenshots/graphics-overhaul-after/orbit-desktop.png)      | [Before](screenshots/graphics-overhaul-before/orbit-mobile.png)      | [After](screenshots/graphics-overhaul-after/orbit-mobile.png)      | [Follow](screenshots/graphics-overhaul-after/orbit-mobile-follow.png)      |

After-capture draw-call/triangle/mesh/material estimates are saved beside each after image as `*-stats.json`; the baseline capture predates the stats writer, so this pass does not claim a controlled before/after render-cost delta. The after run ranged from 276–313 draw calls, 94,030–109,324 triangles, 238–260 meshes and 131–156 materials. FPS was 2–5 in SwiftShader. These are scene diagnostics, not GPU timings or memory allocation, and cannot establish iPhone/Android quality or performance.

## Implemented

- Four deterministic customer hair silhouettes use only a small cached color palette. Appearance and blink phase derive from the authoritative customer ID, keeping multiplayer clients visually consistent without sending new state.
- Lightweight eye lids blink on chef/customer rigs during play and stop under Reduced Motion. Existing server-driven waiting/eating/impatience/leave poses remain the source of customer animation.
- Added six CC0 effects (three Kenney OGG foley cues and three Freesound preview MP3s) for pickup, placement, chopping, frying, washing and service/food-ready cues. Audio buffers load only after an enabled player gesture, share Master/SFX/mute/tab handling, throttle repeated actions and cap concurrent sample voices. Existing synthesized per-restaurant music and warnings remain.
- The asset pipeline retains procedural fallback; no new external model is asserted.

The art direction and implemented palette/material rules are in [ART_DIRECTION_KITCHEN_RUSH.md](ART_DIRECTION_KITCHEN_RUSH.md); sources and license evidence are in [ASSET_MANIFEST.md](ASSET_MANIFEST.md).

## Quality limits / Pass 2 work

The world is still made chiefly from procedural meshes. The before/after pictures should be inspected at full size: customer hair differences and blink animation are subtle at overview distance, so this pass is not a dramatic environment/food redesign. Most appliance bodies share the current art system, food is not hand-sculpted, and all five rooms retain their existing architecture and prop construction. No production GLB, rigged animation clips, facial expression set, baked AO, authored IBL, texture atlas, or professional soundtrack was added. OGG decode was checked in Chromium only; Safari/iOS playback is not verified here.

Before release-quality art claims, create and review artist-authored models, improve chef hands/face and NPC body silhouettes, plate every recipe with more visual specificity, strengthen station shapes beyond trims, fix portrait composition/label crowding, and profile Standard/Low on iPhone 13, iPhone 14 Pro Max and representative Android hardware. Existing SwiftShader can be very slow; it is not a handset benchmark. Full visual overhaul acceptance remains open.

## Reproduction

```powershell
$env:GUEST_ONLY='true'
npm.cmd run build
$env:E2E_PRODUCTION='true'
$env:GRAPHICS_CAPTURE_DIR='docs/screenshots/graphics-overhaul-after'
npm.cmd run test:e2e -- tests/e2e/graphics-overhaul.spec.ts tests/e2e/audio-assets.spec.ts
```

## Surface and character refinement — 2026-10-10

- Little Sun now has a readable sage/cream checker floor instead of two nearly identical cream tiles.
- Tide has a wave-pattern perimeter; Olive has four-petal ceramic border tiles; Lantern has inset diamond border tiles; Orbit has recessed panel corners and cyan perimeter guidance strips. The central preparation area remains restrained.
- These four floors use one cached 512×512 RGBA texture each, with mipmaps and 4× anisotropic filtering. Base texture storage is 1 MiB per floor (about 1.33 MiB including mipmaps), up from 256 KiB. This increases texture memory without adding draw calls or floor geometry. Material caching/disposal remains scene-owned.
- Chef and customer heads now have modeled ears with inner warmth to improve the side silhouette; existing face, hair variants, blink and server-driven poses are preserved.
- New captures are written to `screenshots/graphics-overhaul-surface/`, preserving the earlier before/after set. A complete professional character, food and appliance remodel is still outstanding; this continuation does not claim to satisfy the full overhaul on its own.
- Production build/typecheck passed. Full unit/regression: **363 passed, 9 skipped** (database-dependent tests). One full production E2E run ended at **56 passed, 1 skipped, 1 failed**; the lobby failure was diagnosed and its focused production rerun passed after the CSS fix and correcting the three-peer inventory assertion. The whole suite has not been rerun after those fixes; see [PROGRESS](PROGRESS.md) for the exact scope.

Measured surface continuation: all ten production captures completed. Relative to the earlier `graphics-overhaul-after` stats at the same initial scenes, desktop draw calls and mesh counts are unchanged in all five restaurants; triangle diagnostics increase by 2,624 for the additional character geometry. New scenes range from 276–313 draw calls, 96,654–111,948 triangles and 238–260 meshes. The comparison is against the immediately preceding iteration, not the original baseline (which has no saved stats). See [interactive screenshot comparison](graphics-comparison.html). No mobile GPU performance claim follows from these SwiftShader samples.

## Chaotic Pop identity pass (2026-10-12)

The game now uses one original shared bold-color system with five distinct restaurant palettes. This continuation changes environment/material colors and UI treatment while preserving geometry budgets, station roots, touch/camera behavior and gameplay state. Real baseline and post-pass captures plus renderer caveats are in [CHAOTIC_POP_VISUAL_AUDIT.md](CHAOTIC_POP_VISUAL_AUDIT.md); design rationale is in [CHAOTIC_POP_ART_DIRECTION.md](CHAOTIC_POP_ART_DIRECTION.md). This remains a palette/material/UI pass over procedural geometry, not the final model overhaul described above.
