# Kitchen Rush — Chaotic Pop art foundation

Working production rules for Pass 3 and future asset replacement. “Final” names the requested foundation document, not final aesthetic approval. Original stylized art, mobile first; no copied franchise models or unlicensed assets.

## Hierarchy and shapes

Read the chef, held item, active station and order before decoration. Use compact chibi bodies, broad asymmetric toque, large mitten hands and readable eyebrows/mouth. Preserve four visible team coat colors. Warm skin, paper ceramic and bright edible layers separate from medium-value counters and floors. Chunky grips/dials, a curved pot/wok and distinct board/basin/pass silhouettes identify equipment without labels alone.

Bold accents belong on one control, a cabinet edge, a ticket, a cuisine sign or a short confirmed reaction. Walkable floor has broad rhythm and subtle variation. Avoid fine checker noise, an emissive grid, random surface noise, excessive garnish, continuous camera shake or decorative UI coverage.

## Five worlds

| Venue      | Floor and architecture                                                       | Lighting target                           | Food focus                                                   |
| ---------- | ---------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| Little Sun | Broad warm checker; teal wainscot, retro windows, stack illustration         | Warm key, neutral soft fill               | Layered burger crown/lettuce/meat/cheddar, golden fries      |
| Tide       | Ocean ceramic; shoji, bamboo, wave accents, fish illustration                | Fresh near-neutral coastal key            | White rice, salmon/tuna grain, dark nori and visible filling |
| Olive      | Offset terracotta/limestone; arches, amphora, olive planting, tomato graphic | Warm key with restrained olive bounce     | Pasta/sauce, protein, toasted bread and baked cheese         |
| Lantern    | Charcoal/redbrown brick; timber/eaves, lanterns, wok graphic                 | Warm key with restrained cool fill        | Noodles, pepper, tofu, beef, folded dumpling shapes          |
| Orbit      | Indigo panels; portholes/planets, structural ribs, hydroponics               | Cool fill, neutral-warm edible highlights | Protein/greens, mushroom caps, crisp bread, comet greens     |

All five share tone mapping, two-light budget, rounded edge language, material families, status semantics and UI tokens. Identity should remain visible with color removed through architecture, floor construction and equipment silhouettes. No new station layout is part of this visual pass.

## Material rules

Use cached PBR archetypes rather than per-frame instances. Roughness values are quantized by the existing material cache; implementation values belong in `world-art.ts`. Working ranges:

| Family        | Roughness | Metallic | Highlight and edge treatment                                      |
| ------------- | --------- | -------- | ----------------------------------------------------------------- |
| Painted metal | 0.48–0.68 | 0–0.18   | Broad satin highlight, rounded lip; paint is mostly dielectric    |
| Ceramic       | 0.28–0.48 | 0        | Clean soft highlight, thick rim                                   |
| Wood          | 0.86–0.96 | 0        | Matte, warm broad value separation, no plastic sheen              |
| Fabric        | 0.96      | 0        | Matte coat/apron/hat, shaped folds rather than glossy seams       |
| Plastic       | 0.68–0.86 | 0        | Restrained control/handle highlights                              |
| Food          | 0.68–0.86 | 0        | Edible color/layers, no metallic reflections                      |
| Glass         | 0.28–0.48 | 0        | Opaque stylized glass permitted; do not imply physical refraction |
| Stone         | 0.86–0.96 | 0        | Satin/matte, narrow muted seams                                   |
| Sci-fi panel  | 0.68–0.86 | 0–0.18   | Selective light insert, no whole-room bloom                       |
| Bare metal    | 0.28–0.48 | 0.7–0.9  | Limited to cookware, faucet or service bell                       |

Floors remain nonmetallic, mipmapped, anisotropically filtered and world-proportioned. Their relief cues are painted albedo; no normal/displacement or baked AO claim. Avoid bright grout and excessive gloss. Floor, feet and furniture bases share a visual ground plane; soft vertex-alpha contacts supply inexpensive grounding in Low.

## Motion and feedback

Transform animation uses submitted frame time and actual snapshots. Confirmed pickup, work, completion, wash, serving, combo and results can select short poses or existing pooled cues. Waiting/Eating/Leaving drive customers. No predicted inventory ownership, invented customer state or client scoring. Reduced Motion keeps expression/carry/status but removes blink/bob/pool motion. No continuous effects outside the existing budget.

## Mobile budget

Retina resolution remains independent of graphics and frame cadence. Balanced touch targets 30 FPS, Low 24, High 60; idle/menu/result 15; hidden tab stops drawing. Balanced uses a 512 map with lightweight sampling and 10 Hz refresh; desktop/High retain 768 blur. Prefer batch/material reuse and simple contact geometry over SSAO or extra lights. No GLB, texture or animation allocation each frame. Pool limits remain Low 6, touch 12, desktop 24, Reduced Motion 0.

Mesh/draw/triangle/material/buffer estimates must be compared on the same scene. SwiftShader is not a phone benchmark. Real iPhone heat, Safari color/sharpness, sustained touch response and battery testing remain acceptance requirements.

## UI cohesion

Use `chaotic-pop-theme.ts` ink/paper/accent semantics for HUD, tickets, labels, campaign, results and profile presentation. Bold clean typography, one primary accent and text plus icon for urgency. Preserve current tap targets/safe areas; no extra borders or art occupying the control zone. Account/profile visuals never change data or authentication.

## Asset gate

Every replacement must pass overhead portrait/landscape, held/placed, Low/High and Reduced Motion review; shadow/contact grounding; four coat colors; no picking/collision change; bounded disposal; real gameplay snapshots and full regression. Keep source/license/version/fallback in ASSET_MANIFEST. Concept renders and offline inspection sheets must be labeled separately from gameplay.

The current procedural rig is suitable for a first customization prototype. Production sculpted characters, skeletal clips, unique plating and real-device approval are still open. See [Character Creator handoff](CHARACTER_CREATOR_ART_HANDOFF.md).
