# Chaotic Pop — art direction pass 1

Pass 3 adds targeted grounding, semantic surface families, restrained venue-specific balance of the same two lights and prepared-component plating. It retains Pass 2 floor layouts, expressions, Retina and mobile cadence. Current rules: [art bible](CHAOTIC_POP_FINAL_ART_BIBLE.md); scope and verification: [Pass 3](CHAOTIC_POP_PASS3_IMPLEMENTATION.md). Production art quality and native iPhone thermal validation remain open.

Pass 2 now supersedes the floor/character/render descriptions below; the remainder is the Pass 1 historical brief. See [Pass 2 plan](CHAOTIC_POP_PASS2_ART_PLAN.md), [floor design](CHAOTIC_POP_PASS2_FLOOR_REDESIGN.md) and [character system](CHAOTIC_POP_PASS2_CHARACTER.md). Current floors use terracotta/cream diner ceramics, deep ocean tiles, terracotta/limestone groupings, staggered street tiles and indigo panels, rather than only different palettes. Chef faces use an original shared expression atlas. Thermal workload is constrained separately from Retina resolution; touch Balanced targets 30 FPS with 10 Hz lightweight shadows. Art acceptance and actual iPhone temperature testing remain open.

Updated 2026-10-12. This is an original color-and-presentation system for Kitchen Rush 3D, not an imitation of another cooking game and not a claim that the art is final.

## Design intent

Give the small isometric kitchen the energy of a playful food sticker sheet while keeping the chef, ingredient, active station and order readable first. The identity is mischievous, awkward and lively rather than polished or cynical. Strong color belongs on cabinet faces, signs, borders and controls; the busiest walkable area stays medium-value and uncluttered. Humor comes from the chef's oversize toque, a jaunty customer reaction and a well-timed puff instead of meme copy or constant emoji.

## Shape and graphic language

Keep the current chibi chef with a head-forward silhouette, compact coat, puffy toque and clear apron. Combine rounded food/cook forms with intentionally straight tile seams, sign panels and counter edges. Future authored props can lean slightly off-axis, use a chunky handle or exaggerated knob, and add one comic-size detail; avoid making every object soft, toy-like or lopsided. Sticker-like marks and thick borders belong on a sign, ticket edge or one state cue at a time, never over the recipe or station target.

## Shared tokens

The source of truth is [`apps/client/src/game/chaotic-pop-theme.ts`](../apps/client/src/game/chaotic-pop-theme.ts). Scene colors and CSS theme variables use the same restaurant records.

| Token   | Color     | Use                                                 |
| ------- | --------- | --------------------------------------------------- |
| Ink     | `#25243A` | Text, dark foundations, high-contrast HUD           |
| Paper   | `#FFF9E9` | Tickets, dialogs, station labels                    |
| Cream   | `#FFF1D2` | World material and warm food highlights             |
| Chili   | `#F4513D` | Urgency, secondary marks, focus and warning accents |
| Mustard | `#FFC72C` | Primary actions, active stations, combo highlights  |
| Grape   | `#6937C8` | Character and campaign accent                       |
| Teal    | `#159B88` | Shared kitchen color and food/chef distinction      |
| Success | `#19734F` | Ready/completed border, accompanied by status text  |
| Danger  | `#D84235` | Burn/urgent border, accompanied by status text      |
| Warning | `#B66A00` | Caution label, never the only cue                   |

Primary buttons use each restaurant's bright accent with ink text. Decorative color does not replace status text or the existing authoritative state indicators.

Keep ingredients' existing item colors and recipe-specific geometry. Put bright food against medium/dark counter tops, retain lighter ceramic plate rims, and use text + icon + color for cooking/warning state so common color-vision loss does not remove the signal. The new theme test checks ink against every primary accent and paper for a minimum 4.5:1 contrast; it does not replace full-screen color-vision simulation or human accessibility review.

## Restaurant identities

| Restaurant           | Main materials                                     | Room cue                                                         |
| -------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Little Sun Diner     | Blue-green enamel, toasted wood, mustard and chili | Teal/cream checker, yellow diner wall and daisy print            |
| Tide Sushi House     | Deep ocean blue, pale aqua, coral and gold         | Cyan ceramic floor, rice-paper screens, bamboo and waves         |
| Olive Garden Kitchen | Leaf green, terracotta, olive and warm tile        | Alternating olive/limestone mosaic floor, arches and plants      |
| Lantern Wok          | Lacquer red, dark plum wood, golden paper and jade | Brick/charcoal diamond floor, timber beams and hanging lanterns  |
| Orbit Kitchen        | Grape structure, indigo, sky cyan and acid lime    | Indigo panel floor, portholes, candy planets and guidance strips |

These accents tint existing restaurant-specific architecture; they do not move station roots, customer seats, collision geometry, touch targets or navigation coordinates.

## Rendering and UI rules

- Retain the orthographic camera, render-resolution selection, shadow/effect profiles and cached PBR material system. The pass changes light balance and palette only.
- Use lower, more neutral fill/key levels so saturated albedo remains distinguishable under ACES tone mapping; do not use post-processing or frame-loop material creation.
- Keep contrast concentrated on the edge architecture and interface rails. Labels, ticket cards, buttons and status colors have visible borders/shadows and dark text.
- The canvas stays responsible for the world; HTML/CSS remains responsible for crisp HUD and mobile controls.
- Reduced Motion, graphics quality, Retina scaling, audio controls and mobile screen layout remain under their existing systems.

## Asset and scope statement

All additions in this pass are original TypeScript/CSS and existing procedural Babylon meshes/canvas textures. No external model, texture, font, sound, AI bitmap, account, database, economy or social system is added by this pass. The art is a first color-identity pass over still-procedural geometry; it does not imply premium authored models or a final lighting/material review on real phones.
