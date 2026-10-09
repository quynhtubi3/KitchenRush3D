# Asset manifest

| Asset                                      | Source/path                                 | License/status                                                        |
| ------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------- |
| Chef, hat, apron, customers                | `apps/client/src/game/scene.ts`, `person()` | Original procedural meshes, present                                   |
| Kitchen, counters, grill, sink, bin, seats | same file, `buildKitchen()`                 | Original procedural meshes, present                                   |
| Plates, burger, patty, lettuce, buns       | same file, `food()`                         | Original procedural meshes, present                                   |
| Floor, walls, windows, lamps, plants       | same file                                   | Original procedural meshes, present                                   |
| Action tones                               | `apps/client/src/audio.ts`                  | Original Web Audio synthesis, present                                 |
| Food/trophy UI symbols                     | system emoji/text                           | Platform rendering; no downloaded image asset                         |
| DM Sans, Be Vietnam Pro                    | Google Fonts CSS import                     | SIL Open Font License; optional network font with sans-serif fallback |

No proprietary game assets, copied models or third-party music are used. Procedural geometry is the primary fallback and is always available. Running/waiting/eating use lightweight transform animation; no external animation clips. Full animation set and particles remain unfinished.

Font references: https://fonts.google.com/specimen/DM+Sans and https://fonts.google.com/specimen/Be+Vietnam+Pro. Font downloads are cosmetic; the game functions with system fonts when blocked.

Phase 3 adds original palette variants and station layouts for five kitchens, catalog-colored ingredient meshes, assembled dishes built from their component meshes, a mixing bowl and a VIP crown. Guest colors identify special types. All are procedural; detailed equipment/model variations remain unfinished.

## Guest 4.3 — 3D Pass 2 additions

- `apps/client/src/game/geometry-budget.ts` adapts rounded-box, sphere, cylinder, tube and lathe segmentation to isometric viewing size, and quantizes PBR roughness/metallic finishes to reuse materials.
- `apps/client/src/game/scene.ts` gives open worktables, cutting boards, sinks, plate racks, service passes, booths, ovens and waste bins different support/body silhouettes without changing station roots or simulation coordinates. It also adds a ridged, vertex-colored low-poly leaf mesh; trims micro garnish; lowers the shadow map to 768 px; limits tiny details as shadow casters; and reports draw calls, active meshes, unique geometry, triangles, shadow casters and approximate geometry/texture buffer bytes.
- `apps/client/src/game/model-assets.ts` and `apps/client/public/assets/models/README.md` provide a lazy Babylon glTF 2.0/GLB loader, per-scene cache, instancing and disposal. A generated minimal GLB exercises the loader in `tests/model-assets.test.ts`; **no production GLB is included or used**. Procedural assets remain the fallback.
- The five cuisine environments and current articulated chef/customer designs remain procedural. No Blender-authored model, external asset, sculpted mesh, baked AO/IBL, hand-painted texture atlas or skeletal clip is claimed in Pass 2.

Guest polish adds six original procedural music motifs in `apps/client/src/audio.ts`: menu and one per restaurant, with distinct root notes, sequences and tempo. They use Web Audio triangle oscillators; action tones use sine oscillators. No audio files are downloaded. Settings expose separate master/music/SFX gains and mute. These are basic synthesized motifs, not a complete soundtrack; layered cooking ambience and near-burn/customer warnings remain unfinished.

## Guest 4.3 - original 3D Pass 1 assets

- `game/rounded-geometry.ts`: reusable beveled geometry with thin-surface clamping; original mesh generation, no downloaded models.
- `game/scene.ts`: articulated cartoon chef/customer rigs, face/hair/toque/apron, team-colored coat/sleeves, VIP crown, glasses, cap and bow tie; rounded station bodies, faucet, rack, cutting board/knife, stove, upholstered seating, ceramic plates, layered burger.
- `game/restaurant-art.ts`: shoji/bamboo/waves, plaster arches/amphora/olive branches, lanterns/tiled eaves, portholes/planets/hydroponics; cuisine-specific pots/wok/induction and 28 cuisine ingredient/preparation variants. Prepared bun shares bun geometry. Recipes assemble actual component models; sushi has a dedicated nigiri presentation.
- Canvas-generated Little Sun checker terrazzo, floral wallpaper, window view and sign; cached PBR materials and geometry, static meshes merged by material within their station.
- Rig idle/walk/carry, customer eating bob, pooled steam/burnt smoke and state-colored heating element. Reduced Motion removes oscillation/drift; Low Graphics disables shadows and steam. Existing Guest 4.2 audio is retained.

No Blender executable or imported glTF/GLB pipeline was used in this pass. There are no claimed third-party model licenses or AI-generated bitmap assets. Procedural models remain visibly simple at close zoom; no baked ambient occlusion, sculpted normal maps, facial expressions, full skeletal animation or professional soundtrack. These are Pass 2 work, not implied by test success.
