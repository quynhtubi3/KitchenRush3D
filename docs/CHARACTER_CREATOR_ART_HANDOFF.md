# Character Creator — art handoff

Preparation only. No wardrobe UI, cosmetic inventory, ownership, currency, equip API, appearance networking or PostgreSQL migration is implemented by this handoff.

## Runtime contract

The current actor is a Babylon TransformNode rig, not a skinned GLB. Root retains authoritative world position/yaw; torso owns two arm pivots, root owns head and two leg pivots. Head is `(0,1.3,0.015)` with a small upward tilt; torso y 0.65, arms x ±0.34/y 0.17, legs x ±0.16/y 0.36. Existing code can squash/rotate these transforms, so replacement geometry must preserve the pivots.

Logical attachment slots: head/face, head/hat, head/hair, torso/coat, torso/apron, left/right arm and gameplay-held item. Pass 3 creates identity `${actorId}-hat-slot`, `-hair-slot` and `-apron-slot` nodes beneath head/head/torso; meshes are separately batched within those roots. Root metadata records `chef-procedural-v1`, slot names and the anchor. This is an implemented visual assembly contract, not an equip API. The held root remains `(0,0.78,0.51)` under the chef root, independent of animated hands and authoritative owner. Cosmetics cannot move or replace gameplay items.

The face is one curved alpha-test surface on the head using a shared 512px atlas. Eight presets (neutral, happy, focused, confused, panic, proud, disappointed, exhausted) each have an eyes-closed cell. The UV convention is custom and differs from standard poster planes. Keep the central face patch x ±0.32/y ±0.275 unobstructed, including eyebrows, cheeks/nose and all expressions. Never allocate a material or raster texture per expression/frame.

## Replaceable parts and materials

Static submeshes merge by material inside each articulated part. Individual original mesh names disappear; rebuild the affected slot/part, not a disposed source mesh. Preserve a visible `team-coat` contribution on torso and sleeves for all four players. Skin/face, hair, fabric/coat, fabric/apron, hat, shoes and accessories use shared family materials. Do not recolor another actor through a shared material mutation; choose cached color/finish variants or a bounded actor override.

Hat envelope: roughly radius 0.35 and y 0.5–1.2 relative to head, asymmetric toque currently wider near crown. Hair must clear the face patch, ears and hat lower band. Apron replacement clears arms and held dish; avoid solid wide skirts outside the coat footprint. Accessories should fit within the current silhouette, remain non-pickable and avoid the route/interaction marker. No cosmetic collider.

## Animation compatibility

Review idle, walk/run, carry, work pulse, service, won/failed static expressions, all eight moods and Reduced Motion. Current work types share transform reactions; there are no authored skeleton clips/finger grips or certified retargeting. A future GLB needs an explicit adapter preserving runtime roots/pivots, face preset mapping and fallback. Do not assume node names in an arbitrary model match the procedural rig.

## Naming and asset versions

Suggested production names: `chef_v1_hat_<id>`, `chef_v1_hair_<id>`, `chef_v1_coat_<id>`, `chef_v1_apron_<id>`, `chef_v1_face_<id>`. Export meters/Y-up, centered attachment origin, frozen transforms, bounded texture sizes; include source file, license, material slots and compatible rig version. IDs must later be validated separately from file paths. Never load arbitrary user URLs as equipped assets.

The existing `model-assets.ts` lazy GLB loader/cache is available; no production GLB is supplied. Cache shared geometry/materials per scene, release instances and per-actor overrides on disposal, retain procedural fallback for unavailable/incompatible assets. Use mesh merging for static same-material parts, not across animation joints or replaceable slots.

## LOD and preview requirements

Start with existing size-aware geometry and family finishes. Low may omit accessory micro-detail; preserve head/hand/item silhouette and expressions at all profiles. No forced DPR 1 or Retina downgrade. Preview should be an isolated scene without starting a match, pause/reset its render loop when hidden, and reuse the same asset assembly/face/material code. Show front/three-quarter/overhead and a bounded pose selector; never show fake gameplay evidence.

## Phase 2 integration boundary

Future appearance persistence/sync needs validated cosmetic IDs, rig/asset versions, stable fallback, ownership checks and reconnect-safe state. Those decisions belong to a separate Account implementation, not this art pass. Existing Guest progress, authentication, SMTP, cloud save and player data remain unchanged.

Ready now: original expressive procedural rig, cached material/texture pipeline, four team slots, lazy model loader, offline review page. Still required before production customization: sculpted garment/hat quality, clipping QA across replacements, native phone budget, versioned network contract, ownership/persistence design and per-action authored animations if desired.
