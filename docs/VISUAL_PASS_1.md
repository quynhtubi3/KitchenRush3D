# Guest 4.3 — 3D Pass 1 review

This is the first procedural art pass, not final art approval. Build and gameplay tests establish functionality, not artistic quality. No simulation, recipe timing, collision, unlock or network authority changes belong to this pass.

## Direction and implementation

A small tabletop kitchen with rounded enamel cabinets, warm ceramics, soft cartoon faces and readable layered food. Each restaurant reuses equipment behavior while changing architecture and selected equipment silhouettes:

| Restaurant | Visible original work                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Little Sun | Terrazzo checker floor, daisy wallpaper, landscape windows, brass pendants, sun sign, clock faces, upholstered seats and enamel kitchen                |
| Tide       | Paper shoji lattice, bamboo, carved wave band, indigo noren, ceramic rice cooker, bamboo assembly mat and salmon nigiri                                |
| Olive      | Plaster arches, mosaic accents, terracotta amphorae, olive branches, copper pasta pot, oil cruet and pasta/tomato/flatbread geometry                   |
| Lantern    | Timber posts, tiled eaves, ribbed lanterns with tassels, street menu plaques, curved wok and noodle/pepper/tofu geometry                               |
| Orbit      | Portholes with stars/planets, structural ribs, cyan deck/control strips, hydroponic plants, induction plate and protein/star-greens/orb-bread geometry |

Chef rigs have independently posed torso, head, arms and legs, with a large face, eyebrows, flattened eyes, hair, toque, apron, cuffs and shoes. Four coat colors remain tied to multiplayer slots. Customers wear shirts instead of aprons; VIP crowns, complex-order spectacles, impatient caps and combo bow ties reinforce existing type colors. Held food remains under its authoritative owner's visual root. Seated legs bend; idle/walk/carry/eating are lightweight transforms, not imported skeletal clips.

## Asset pipeline

- `apps/client/src/game/rounded-geometry.ts` generates bounded rounded surfaces. Cached vertex templates are copied before assignment because Babylon's mesh merge may mutate extracted arrays. A regression test repeats translated merges to ensure templates stay unchanged.
- `scene.ts` owns material caches, Little Sun detail, rigs, snapshot-driven item replacement, picking, camera and lighting. `restaurant-art.ts` supplies the other four environments, equipment additions and cuisine ingredients.
- Static meshes merge by material inside each station root, so inherited station picking remains intact. Character meshes merge within individual joints, preserving animation. No mesh is constructed by the frame animation loop.
- Original canvas textures provide Little Sun floor, wallpaper, windows and lettering. Other themes use modeled detail and PBR color/roughness/metallic; they do not yet have authored texture atlases or normal maps.
- Three pooled puffs per stove/sink show processing steam and burnt smoke. State-colored heating elements and the existing Guest 4.2 warnings remain authoritative snapshot feedback. Reduced Motion freezes drift/oscillation; Low Graphics disables shadows/puffs and lowers render resolution. Audio settings and synthesized SFX are unchanged.
- No Blender, downloaded model, AI-generated bitmap, glTF import or external animation clip is claimed. The installed renderer can be extended with a glTF loader later, but this pass delivers procedural assets locally.

## Real gameplay screenshots

The linked desktop captures were refreshed by the production campaign E2E after serving a real level-5 dish in each restaurant (1440×1000). The campaign suite also loaded all ten levels in every restaurant and opened each recipe notebook. The linked mobile captures come from the visual suite in live matches at a 390×844 Chromium touch viewport; they are viewport emulation, not physical-phone captures. Campaign-unlock localStorage is only a navigation fixture; no food, score or simulation snapshot is injected. The `*-desktop-stats.json` records are from the visual suite's earlier desktop recipe-assembly stage: stable mesh/material counts across the 2.2-second check, with no JavaScript page errors. Campaign screenshots are later served-dish moments and are not the exact frame used by those JSON records. `little-sun-43-world.png` and the other `*-43-world.png` files hide the HUD for art inspection; they must not be represented as the normal interface.

| Restaurant | Desktop                                          | Mobile portrait                                |
| ---------- | ------------------------------------------------ | ---------------------------------------------- |
| Little Sun | [Desktop](screenshots/little-sun-43-desktop.png) | [Mobile](screenshots/little-sun-43-mobile.png) |
| Tide       | [Desktop](screenshots/tide-43-desktop.png)       | [Mobile](screenshots/tide-43-mobile.png)       |
| Olive      | [Desktop](screenshots/olive-43-desktop.png)      | [Mobile](screenshots/olive-43-mobile.png)      |
| Lantern    | [Desktop](screenshots/lantern-43-desktop.png)    | [Mobile](screenshots/lantern-43-mobile.png)    |
| Orbit      | [Desktop](screenshots/orbit-43-desktop.png)      | [Mobile](screenshots/orbit-43-mobile.png)      |

Little Sun [before](screenshots/little-sun-43-before.png) and [after](screenshots/little-sun-43-after.png) are distinct live-gameplay captures, not a pixel-identical benchmark.

## Quality limits and Pass 2

- Faces, hands and cloth remain visibly procedural. Proportions and facial appeal need artist review, sculpted accessories, better skin/hair shading and expressive animation. The chef's tall toque can compete with item labels.
- Equipment is identifiable, but most cabinet bodies still share a construction; authored silhouettes for each cuisine would improve identity further. Food detail remains small at normal camera distance.
- Lighting uses PBR, a hemispheric fill, directional light, tone mapping and a soft shadow map. There is no authored IBL, baked AO/contact-shadow pass, lightmap or reflection probe. Metal/ceramic response and grounding need another pass.
- Architecture stays on the rear/perimeter to preserve navigation. Large empty floor areas and the HUD overlapping rear architecture need composition work. Touch labels are readable but obscure small models; portrait gives little room for visual storytelling.
- Static batching reduces draw submissions but this is not a final mobile budget: the five desktop captures report 304–337 meshes, 138–161 materials and 227,228–279,334 triangles in these scenes. The headless Chromium SwiftShader diagnostic reported 1–2 FPS; this is too slow to count as a mobile performance pass and is not representative of a physical GPU. There is no LOD system, instanced food atlas, compressed GLB pipeline, texture streaming or device thermal test.
- Standard and Low Graphics must be compared on actual Android/iOS hardware. Safari/iOS, GPU memory and long-session thermal behavior are unverified.
- Pass 2 should prioritize stronger chef/customer art, fuller dish presentation, AO/IBL, rear-scene/HUD composition, real-device profiling and LOD before adding more decorative density.
