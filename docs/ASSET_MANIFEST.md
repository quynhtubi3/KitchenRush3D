# Asset manifest

## Chaotic Pop Pass 3 (2026-10-12)

Original project-authored code/material rules in `game/world-art.ts`: semantic cached surface families, five restrained two-light profiles, nominal visual ground plane and a procedural rig contract. `scene.ts` extends cabinet/booth/pedestal/bin/shoe grounding, creates hat/hair/apron replacement roots, exposes the unchanged held anchor, lifts sushi filling above the rice cap and plates actual regional recipe components. `station-grounding.ts` extends the existing vertex-alpha batch to furniture/wall-floor contacts without textures. The offline inspection page adds the runtime level-10 equipment kit. No downloaded/AI asset, production GLB, new license, new texture atlas or Blender export is introduced; existing asset/audio/font provenance remains unchanged. See [Pass 3 implementation](CHAOTIC_POP_PASS3_IMPLEMENTATION.md).

## Chaotic Pop Pass 2 (2026-10-12)

Original repository-authored procedural assets: five coarse ceramic/stone/panel floor textures (`game/floor-texture.ts`), one shared eight-expression/blink face atlas and curved expression surface (`character-face.ts`, `scene.ts`), food mascot plaques for the five venues (`restaurant-graphics.ts`), chef/customer proportion adjustments, selected appliance controls, burger/cheddar silhouette and pooled low-poly comic burst. No external asset, AI bitmap, paid API, Blender export or production GLB was introduced. Existing audio/font licenses remain unchanged. The offline `art-study.html` presents the actual runtime asset kit and is explicitly separate from gameplay evidence. Source/quality/performance details: [Pass 2 implementation](CHAOTIC_POP_PASS2_IMPLEMENTATION.md).

Pass 2 authorship: generated directly in this repository during this implementation. These are original project assets, subject to the repository's licensing terms; no separate third-party license or open-source asset license is claimed. The raster sources are editable canvas paths/pixel layouts in the named TypeScript files, not downloaded textures. At runtime the five floors use scene-scoped 512px caches, all character expressions share one 512px atlas, and each venue's two plaques share a 256px illustration. The comic burst reuses the existing pooled effect slot.

`game/station-grounding.ts` adds original floor-reaching worktable support dimensions and soft vertex-alpha foot shadows. One room-wide mesh/material batch grounds the open-table feet, with no authored/downloaded texture, collider or interaction target.

| Asset                                      | Source/path                                 | License/status                                                                            |
| ------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Chef, hat, apron, customers                | `apps/client/src/game/scene.ts`, `person()` | Original procedural meshes, present                                                       |
| Kitchen, counters, grill, sink, bin, seats | same file, `buildKitchen()`                 | Original procedural meshes, present                                                       |
| Plates, burger, patty, lettuce, buns       | same file, `food()`                         | Original procedural meshes, present                                                       |
| Floor, walls, windows, lamps, plants       | same file                                   | Original procedural meshes, present                                                       |
| Music and fallback action tones            | `apps/client/src/audio.ts`                  | Original Web Audio synthesis; short recordings were added in the 2026-10-10 refresh below |
| Food/trophy UI symbols                     | system emoji/text                           | Platform rendering; no downloaded image asset                                             |
| DM Sans, Be Vietnam Pro                    | Google Fonts CSS import                     | SIL Open Font License; optional network font with sans-serif fallback                     |

No proprietary game assets, copied models or third-party music are used. Procedural geometry is the primary fallback and is always available. Running/waiting/eating use lightweight transform animation; no external animation clips. Full animation set and particles remain unfinished.

Font references: https://fonts.google.com/specimen/DM+Sans and https://fonts.google.com/specimen/Be+Vietnam+Pro. Font downloads are cosmetic; the game functions with system fonts when blocked.

Phase 3 adds original palette variants and station layouts for five kitchens, catalog-colored ingredient meshes, assembled dishes built from their component meshes, a mixing bowl and a VIP crown. Guest colors identify special types. All are procedural; detailed equipment/model variations remain unfinished.

## Guest 4.3 — 3D Pass 2 additions

- `apps/client/src/game/geometry-budget.ts` adapts rounded-box, sphere, cylinder, tube and lathe segmentation to isometric viewing size, and quantizes PBR roughness/metallic finishes to reuse materials.
- `apps/client/src/game/scene.ts` gives open worktables, cutting boards, sinks, plate racks, service passes, booths, ovens and waste bins different support/body silhouettes without changing station roots or simulation coordinates. It also adds a ridged, vertex-colored low-poly leaf mesh; trims micro garnish; lowers the shadow map to 768 px; limits tiny details as shadow casters; and reports draw calls, active meshes, unique geometry, triangles, shadow casters and approximate geometry/texture buffer bytes.
- `apps/client/src/game/model-assets.ts` and `apps/client/public/assets/models/README.md` provide a lazy Babylon glTF 2.0/GLB loader, per-scene cache, instancing and disposal. A generated minimal GLB exercises the loader in `tests/model-assets.test.ts`; **no production GLB is included or used**. Procedural assets remain the fallback.
- The five cuisine environments and current articulated chef/customer designs remain procedural. No Blender-authored model, external asset, sculpted mesh, baked AO/IBL, hand-painted texture atlas or skeletal clip is claimed in Pass 2.

Earlier Guest polish added six original procedural music motifs in `apps/client/src/audio.ts`: menu and one per restaurant, with distinct root notes, sequences and tempo. They used Web Audio triangle oscillators; action tones used sine oscillators. At that earlier milestone no audio files had been downloaded. The 2026-10-12 refresh now uses the recorded CC0 loops listed below, retaining synthesis as a browser fallback. Settings expose separate master/music/SFX gains and mute.

## Guest 4.3 - original 3D Pass 1 assets

- `game/rounded-geometry.ts`: reusable beveled geometry with thin-surface clamping; original mesh generation, no downloaded models.
- `game/scene.ts`: articulated cartoon chef/customer rigs, face/hair/toque/apron, team-colored coat/sleeves, VIP crown, glasses, cap and bow tie; rounded station bodies, faucet, rack, cutting board/knife, stove, upholstered seating, ceramic plates, layered burger.
- `game/restaurant-art.ts`: shoji/bamboo/waves, plaster arches/amphora/olive branches, lanterns/tiled eaves, portholes/planets/hydroponics; cuisine-specific pots/wok/induction and 28 cuisine ingredient/preparation variants. Prepared bun shares bun geometry. Recipes assemble actual component models; sushi has a dedicated nigiri presentation.
- Canvas-generated Little Sun checker terrazzo, floral wallpaper, window view and sign; cached PBR materials and geometry, static meshes merged by material within their station.
- Rig idle/walk/carry, customer eating bob, pooled steam/burnt smoke and state-colored heating element. Reduced Motion removes oscillation/drift; Low Graphics disables shadows and steam. Existing Guest 4.2 audio is retained.

No Blender executable or imported glTF/GLB pipeline was used in this pass. There are no claimed third-party model licenses or AI-generated bitmap assets. Procedural models remain visibly simple at close zoom; no baked ambient occlusion, sculpted normal maps, facial expressions, full skeletal animation or professional soundtrack. These are Pass 2 work, not implied by test success.

## Guest graphics and sound refresh (2026-10-10)

| Asset                                        | File / use                                                                 | Source and license                                                                                                                                                                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Soft pickup, ceramic placement, service bell | `apps/client/public/assets/audio/{pickup-soft,plate-place,serve-bell}.ogg` | Selected, unchanged OGG files from Kenney Impact Sounds 1.0; CC0. The pack's license text is shipped in `apps/client/public/assets/audio/licenses/kenney-impact-sounds-cc0.txt`. [Official pack](https://kenney.nl/assets/impact-sounds). |
| Vegetable chop                               | `apps/client/public/assets/audio/chop.mp3`                                 | Freesound sound 839145 by BenParamoreAudio, CC0; downloaded HQ preview MP3 and played as a short transient. [Source and license](https://freesound.org/people/BenParamoreAudio/sounds/839145/).                                           |
| Frying sizzle                                | `apps/client/public/assets/audio/frying.mp3`                               | Freesound sound 547519 by colorsCrimsonTears, CC0; downloaded HQ preview MP3 and played as a short transient. [Source and license](https://freesound.org/people/colorsCrimsonTears/sounds/547519/).                                       |
| Dish washing                                 | `apps/client/public/assets/audio/wash.mp3`                                 | Freesound sound 828463 by fc_mendonca, CC0; downloaded HQ preview MP3 and played as a short transient. [Source and license](https://freesound.org/people/fc_mendonca/sounds/828463/).                                                     |

The six runtime files total about 613 KiB. We retain attribution even though CC0 does not require it. Audio is fetched and decoded only after an enabled player gesture; mute/volume/tab handling remains in the existing Web Audio bus. No third-party music was added. Customer hairstyle variants and blink timing are generated from stable customer IDs; they are not downloaded models or licensed character art.

## Pass 7 procedural food additions (2026-10-11)

Original repository code in `apps/client/src/game/scene.ts` now draws cheese/chicken burger variants, potato fries, regional plated variants, cheese, chicken, potatoes, tuna, mushrooms and specialty prep items. No downloaded mesh or new external license is involved in this content pass. Order/notebook representations remain platform emoji. Regional variants reuse base plated geometry and still need art differentiation; these assets are functional prototypes, not final production models.

## Chaotic Pop identity (2026-10-12)

`apps/client/src/game/chaotic-pop-theme.ts` contains original TypeScript color tokens consumed by Babylon materials and CSS custom properties. `floor-texture.ts`, Little Sun procedural canvas textures, and existing restaurant meshes were recolored; multiplayer chef coat color tokens were deepened. No new bitmap, GLB/glTF, font, audio recording or external asset/license was downloaded or introduced. Existing external audio/fonts are unchanged; see their entries above.

## Guest audio refresh (2026-10-12)

Six CC0 OGG loops from OpenGameArt supply menu and restaurant background music. Authors, track titles, source pages and license records are in `apps/client/public/assets/audio/music/SOURCES.md`. The tracks are fetched after a gesture and decoded one at a time; no external streaming/CDN dependency was added. Music and short sound-effect phrases in `apps/client/src/audio.ts` are original project integration/code. The five prior effects remain unchanged; cat cues remain synthesized.
