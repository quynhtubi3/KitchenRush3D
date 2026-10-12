# Chaotic Pop visual audit

Updated 2026-10-12. This audit compares actual browser-rendered campaign scenes before and after the color identity pass. It is not a physical-device certification.

## Baseline capture

Before files are in [`screenshots/chaotic-pop-before/`](screenshots/chaotic-pop-before/). The existing `graphics-overhaul.spec.ts` starts each level, waits for its live scene, enters overview camera, and captures the HUD plus 3D kitchen at 1440×1000 and 390×844. All five restaurant levels were selected. Result: **10/10 capture tests passed**.

Additional baseline references were preserved in that folder for the menu, 844×390 landscape and four-player view. They are genuine screenshots from earlier passes (`screenshots/menu-desktop.png`, `screenshots/pass6/before/landscape-844x390-follow.png`, `screenshots/pass6/four-player-landscape.png`), not captures from the same 10-test run; the filename `*-reference` marks that distinction. The fresh 10-shot restaurant set is the controlled visual comparison.

At baseline, the Little Sun screenshot showed a light sage/cream checker floor, low-separation cabinet/wall colors, translucent cream panels and fine world labels. The muted palette made the room, appliance tops and overlays visually blend at the 390 px viewport. This is a screenshot-based visual assessment, not a measured human readability study.

Baseline Chromium SwiftShader snapshots reported 260 meshes, 202 active meshes, 313 draw calls, 131 materials, 111,948 triangles and about 11.1 MB of estimated texture storage for Little Sun. The short FPS field read 2 on desktop / 4 on mobile. SwiftShader is a software renderer; these FPS values are not representative of a phone GPU and are not used to justify a device-performance claim.

## Post-change capture

The production browser capture ran the same five restaurant levels with all levels unlocked, Balanced/standard quality, Reduced Motion enabled, all station labels visible and overview camera at 1440×1000 and 390×844. Result: **10/10 screenshot tests passed**. The completed screenshots and JSON diagnostics are in [`screenshots/chaotic-pop-after/`](screenshots/chaotic-pop-after/).

| Restaurant | Before desktop                                               | After desktop                                               | Before mobile                                               | After mobile                                               |
| ---------- | ------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| Little Sun | [PNG](screenshots/chaotic-pop-before/little-sun-desktop.png) | [PNG](screenshots/chaotic-pop-after/little-sun-desktop.png) | [PNG](screenshots/chaotic-pop-before/little-sun-mobile.png) | [PNG](screenshots/chaotic-pop-after/little-sun-mobile.png) |
| Tide       | [PNG](screenshots/chaotic-pop-before/tide-desktop.png)       | [PNG](screenshots/chaotic-pop-after/tide-desktop.png)       | [PNG](screenshots/chaotic-pop-before/tide-mobile.png)       | [PNG](screenshots/chaotic-pop-after/tide-mobile.png)       |
| Olive      | [PNG](screenshots/chaotic-pop-before/olive-desktop.png)      | [PNG](screenshots/chaotic-pop-after/olive-desktop.png)      | [PNG](screenshots/chaotic-pop-before/olive-mobile.png)      | [PNG](screenshots/chaotic-pop-after/olive-mobile.png)      |
| Lantern    | [PNG](screenshots/chaotic-pop-before/lantern-desktop.png)    | [PNG](screenshots/chaotic-pop-after/lantern-desktop.png)    | [PNG](screenshots/chaotic-pop-before/lantern-mobile.png)    | [PNG](screenshots/chaotic-pop-after/lantern-mobile.png)    |
| Orbit      | [PNG](screenshots/chaotic-pop-before/orbit-desktop.png)      | [PNG](screenshots/chaotic-pop-after/orbit-desktop.png)      | [PNG](screenshots/chaotic-pop-before/orbit-mobile.png)      | [PNG](screenshots/chaotic-pop-after/orbit-mobile.png)      |

Each directory also contains renderer diagnostic JSON beside each screenshot. The capture is a browser screenshot of a live room after entering a match; it is not a physical device camera image.

Additional real gameplay captures:

- [Main menu · 1440×900](screenshots/chaotic-pop-after/main-menu-1440x900.png)
- [Little Sun gameplay · 1920×1080](screenshots/chaotic-pop-after/desktop-1920x1080-gameplay.png) with [layout diagnostics](screenshots/chaotic-pop-after/desktop-1920x1080-gameplay-stats.json); this comes from the mobile-layout E2E and is a supplementary viewport check, not part of the controlled before/after pair.
- [Little Sun · 1920×1080 High graphics](screenshots/chaotic-pop-after/little-sun-desktop-1920x1080-high.png) with [renderer stats](screenshots/chaotic-pop-after/little-sun-desktop-1920x1080-high-stats.json). A production browser smoke test switched Low → Balanced → High and verified the scene renderer followed each selection.
- [Small portrait · 360×640](screenshots/chaotic-pop-after/small-portrait.png), [landscape · 844×390](screenshots/chaotic-pop-after/mobile-landscape.png), and [Little Sun chef close-up](screenshots/chaotic-pop-after/little-sun-desktop-closeup.png).
- [Real gameplay victory](screenshots/chaotic-pop-after/victory-desktop.png), [natural timer defeat](screenshots/chaotic-pop-after/defeat-desktop.png), and [four-client multiplayer](screenshots/chaotic-pop-after/four-player-landscape.png).

## Render cost and verification

Little Sun desktop before/after retained **260 meshes, 313 draw calls, 111,948 triangles and 3.66 MB estimated geometry storage**. The material diagnostic changed from 131 to 136. The after estimate is 11,135,062 texture bytes (~10.62 MiB), with 111 shadow casters. Other after scenes ranged from 276–313 draw calls, 96,654–111,948 triangles, 238–260 meshes and 152–161 materials. These are Chromium SwiftShader diagnostics; the displayed FPS (2–6) is software-renderer output and is not a hardware or mobile performance measurement. No geometry was added by the Chaotic Pop patch.

Typecheck, production build and the unit/regression suite passed (**392 passed, 11 PostgreSQL-dependent skipped**). Format and whitespace checks are recorded after the final documentation update in `PROGRESS.md`.

The full production E2E run completed **52 passed, 1 database-dependent skipped and 10 failed**. All 10 failures were the same stale visual assertion expecting idle station-label opacity `0.42` after the UI intentionally changed it to `0.7`; gameplay, recipe cooking, campaign, mobile, multiplayer, reconnect, rendering captures and settings passed in that run. After updating that single assertion, the visual slice rerun passed **9/10**; Little Sun desktop hit one transient cooker-ready timeout, then passed **1/1** when rerun alone. Thus all ten visual slices passed across those follow-up runs, but there was no single all-green full-suite rerun after updating the assertion. This is reported as such rather than labeled a clean 63-test run.

## Limits

The controlled per-restaurant before/after matrix covers 1440×1000 and 390×844; 1440×900, 1920×1080, 360×640 and 844×390 have supplementary gameplay captures, not a full five-restaurant cross-product. The High screenshot/profile smoke test covers Little Sun only; other restaurant screenshots use Balanced. Reduced Motion was enabled in the controlled visual captures and its effect-pool behavior has a separate E2E check. No Safari/iPhone 13 or iPhone 14 Pro Max session was available. No color-vision study, accessibility lab test, low-end Android profile, portrait menu with every setting expanded, or authored-asset review was performed. See [CHAOTIC_POP_IMPLEMENTATION.md](CHAOTIC_POP_IMPLEMENTATION.md) for code scope and [CHAOTIC_POP_PHASE2_HANDOFF.md](CHAOTIC_POP_PHASE2_HANDOFF.md) for the remaining review points.

Interactive pair view: [CHAOTIC_POP_COMPARISON.html](CHAOTIC_POP_COMPARISON.html).
