# Kitchen Rush 3D art direction

Updated 2026-10-10. This is the implemented visual direction for the current procedural game, not a claim that the art is final or production-model quality.

## Visual identity

Kitchen Rush is a small tabletop world of welcoming neighborhood kitchens. Shapes are rounded and hand-finished: glazed cabinets, soft fabric, ceramic plates, plump food layers, curved faces and warm wood. The isometric view must keep the chef, held item and active workstation more legible than background decoration. Original designs use cuisine cues without copying another cooking game's characters, logos or restaurant layouts.

## Color system

- Shared neutral: warm cream `#fff3dc`, paper white `#fffaf0`, dark teal `#1d4642` and restrained brass `#edb64f`.
- Little Sun: diner teal, amber brass, checker terrazzo, cream wallpaper and terracotta accents.
- Tide: pale wood, blue-green cabinetry, indigo curtain, rice-paper cream and ocean-wave blue.
- Olive: muted olive, terracotta, plaster cream, mosaic green and copper.
- Lantern: dark timber, red lacquer, persimmon orange and amber light.
- Orbit: blue-gray structure, deep space glazing, cyan guidance strips and soft lilac/sea-glass accents.
- Chef coats use the four existing multiplayer slot colors. Customers keep their authoritative archetype colors; hair is varied from the stable server customer ID so every client sees the same appearance.

## Characters and animation

Chef scale remains chibi: broad round head, compact torso, articulated arms and legs, oversized toque, visible apron bib/pocket, cuffs and work shoes. The rig retains transform-only idle, walk, carry and work poses, and now includes a few deterministic customer hair silhouettes and quick blink lids. Blinks use only currently rendered customer/chef rigs, have a fixed short envelope and stop under Reduced Motion. Customer behavior remains driven by server snapshots, such as eating, patience and leaving; no presentation state creates a new gameplay event.

## Materials and lighting

Cached Babylon PBR materials use quantized roughness/metallic finishes. Ceramics and food remain mostly matte, small metal fittings use a restrained metallic response, and fabrics/wood/plaster stay rough. A warm hemispheric fill, directional key, ACES tone mapping and a 768 px blurred shadow map establish depth. Little Sun has procedural canvas wallpaper, landscape windows, sign lettering and checker terrazzo; the other restaurant architecture uses cuisine-specific modeled structure and detail. Low Graphics disables real-time shadows/effects while retaining texture and object clarity.

There is no baked AO, authored IBL, hand-painted normal atlas or reflection probe yet. Material response on Orbit glass, steel and ceramics still needs art review on a physical screen.

## Food, environment and readability

Food remains layered, recognizable procedural geometry: brioche and seared patty, separate lettuce, raw/cooked/burnt color states, ceramic plates, sushi/nigiri and cuisine-specific ingredients/dishes. Stations keep their simulation IDs and positions while receiving different visual roles (board, sink, oven/stove, mixer, pass, rack, booth and bin). Each restaurant has a distinct perimeter architecture and cuisine props. Decoration stays at room edges; the play floor and station hit targets retain clear space.

On mobile, contextual station labels and the collapsible order rail reduce screen obstruction. UI is HTML and remains sharp independently of WebGL resolution. The world still leaves excess vertical space in some portrait framing, and a complete screen-space composition pass remains future work.

## VFX, sound and budgets

The render loop animates transforms and bounded pooled station effects; it does not create new meshes per frame. Existing effect caps are six in Low and 24 otherwise, with Reduced Motion disabling them. This pass adds no shaders, post-processing or additional shadow casters for blinking lids.

Short SFX now distinguish pickup/placement, chopping, frying, dish washing and successful service. Three cooking recordings are CC0 Freesound HQ preview MP3s; short Kenney CC0 foley cues provide the stylized pickup/plate/bell transients. Music stays procedural. Assets load only after an enabled user gesture, share existing Master/SFX gains, and are throttled with a ten-voice cap. Their complete sources and licenses are in [ASSET_MANIFEST.md](ASSET_MANIFEST.md).

The established budget remains the governing one: shared materials and geometry, bounded shadows and pooled VFX, no frame-loop allocation. Chromium SwiftShader readings are not a phone GPU benchmark. No device FPS guarantee is made.

## Next art pass

Replace selected procedural chef/customer/food assets with authored, licensed glTF models only after scale, mobile cost, animation, and fallback have been verified. Priorities are a more expressive chef face/hand, several distinct customer body shapes, complete food plating, baked/contact lighting, a portrait composition review and Safari/iOS listening/visual QA. Blender-authored or production GLB art is not included in this pass.

## Surface textures

The current pass strengthens Little Sun's sage/cream checker rhythm and gives the other restaurants dedicated perimeter motifs: coastal waves, Mediterranean four-petal ceramics, warm diamond inlays and futuristic panel strips. Decoration remains at the perimeter. Cached 512px textures and 4x anisotropic filtering preserve detail at an oblique camera angle without additional meshes; Retina drawing-buffer scaling is unchanged. Characters also have modeled ears to strengthen their side silhouette.

## Chaotic Pop palette pass (2026-10-12)

The earlier muted palette above is kept as historical context. The current color source is [`game/chaotic-pop-theme.ts`](../apps/client/src/game/chaotic-pop-theme.ts): shared ink/paper/chili/mustard/teal plus separate cabinet, wood, accent, secondary, floor and wall values for each restaurant. Little Sun's floor is now teal-and-cream, Tide aqua, Olive leaf/limestone, Lantern brick/plum, and Orbit indigo/lavender. The HTML HUD uses an ink rail and paper cards with stronger status borders. Full current rules and limits are in [CHAOTIC_POP_ART_DIRECTION.md](CHAOTIC_POP_ART_DIRECTION.md).
