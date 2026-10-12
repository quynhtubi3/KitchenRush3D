# Chaotic Pop — implementation record

Updated 2026-10-12.

## What changed

- Added `game/chaotic-pop-theme.ts` as the single shared identity table for five restaurant surfaces plus common ink/paper/cream/chili/mustard colors.
- Replaced the old muted restaurant material tokens in `restaurant-art.ts`. Each room now carries its own cabinet, wood, accent, secondary, floor and wall colors while retaining its existing architectural motifs and station dressing.
- Re-authored the four procedural floor palettes in `floor-texture.ts` and strengthened the Little Sun checker, grout, daisy print and diner wall in `scene.ts`.
- Reduced warm light intensity and tone-mapping exposure to avoid washing the stronger albedo colors out. Camera, shadow-map size, rendering scale, quality selection, geometry and station transforms remain unchanged.
- Applied the restaurant tokens to CSS at render time and refreshed the menu, HUD, tickets, station labels, team cards, dialogs, focus, warnings and primary buttons. Layout and touch-control positioning rules are unchanged.
- Deepened the four multiplayer coat colors for distinct team silhouettes. Slot assignment and server state are unchanged.
- Added small snapshot-triggered chef squash/reach and customer dining reactions, plus stronger pooled cutting/steam/water/heat colors. Effects stay in existing pools, are bounded by the existing quality budget and stop under Reduced Motion. Ready/burn/processing state remains indicated by label text and border as well as color.
- Added unit coverage for the five unique visual theme records and preserved the existing checks for distinct floor texture signatures and all 50 level layouts.

## Gameplay and runtime boundaries

The patch is client presentation only. It does not alter simulation code, recipe graphs, station IDs/positions, pathfinding, touch picking, camera framing, server-authoritative multiplayer, Guest/Account configuration, campaign unlock rules or score flow. Materials continue to use the existing scene cache; no per-frame meshes/materials or new render passes are introduced.

## Quality gaps left open

This pass gives the existing art a stronger shared identity; it does not replace the models. No new authored chef/customer silhouette, dedicated chef face/expression set, comic impact mesh, fish motif, sauce illustration, menu poster, or burger-specific wall graphic was built. Cooking success and customer dining use small snapshot-driven transforms and the existing pooled effects, not bespoke animation clips. Restaurant architecture remains the previously built procedural kit with its own structural motif and new material colors. Color-vision simulation and physical-screen review remain pending.

## Verification record

The baseline and post-change live-scene captures each passed **10/10** across five restaurants × desktop/mobile viewports. Additional browser captures cover the menu, chef close-up, 360×640, 844×390, 1920×1080, a real Solo victory, a natural clock defeat and a four-client room.

A supplementary production E2E smoke switched the live Little Sun scene through Low → Balanced → High and verified renderer stats at each selection (**1/1 passed**); it saved a High-quality 1920×1080 screenshot. It does not establish High-quality behavior for all five restaurants or real-GPU performance.

Typecheck and production build passed; Vite still reports the existing large Babylon client bundle warning (~1.31 MB before gzip). Full unit/regression tests passed **392**, with **11 PostgreSQL-dependent tests skipped**. The full production E2E run finished **52 passed, 1 database-dependent skipped, 10 failed**; all ten failures were a stale opacity assertion (`0.42` expected versus the deliberate Chaotic Pop `0.7`). That assertion now checks `0.7`. The focused visual pass then passed **9/10**, with Little Sun desktop passing in a separate **1/1** rerun after a transient cooking-ready timeout. All ten visual cases therefore passed across the follow-up runs, but the entire E2E suite was not rerun as one clean run after the assertion edit. See [CHAOTIC_POP_VISUAL_AUDIT.md](CHAOTIC_POP_VISUAL_AUDIT.md) for the exact scope and caveats. Formatting and `git diff --check` results are finalized in [PROGRESS.md](PROGRESS.md).

No real iPhone/Android device was available in this environment. Aesthetic acceptance on those devices and GPU performance remain open.
