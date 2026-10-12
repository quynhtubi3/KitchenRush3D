# Chaotic Pop Pass 2 — floor redesign

All five floors use `floor-texture.ts` and the scene-scoped `floorMaterial()` cache. Each floor is one ground mesh with one 512×512 RGBA texture, mipmaps and 4× anisotropy. Tile placement is evaluated in the room's 15×11 world dimensions, preserving UV proportions and all walk/pick/collision coordinates.

| Restaurant | Tile design                          | Treatment                                                                                   |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Little Sun | 1.8-unit terracotta/cream checker    | Warm grout, directional bevel edge, small per-tile value variation; removed terrazzo specks |
| Tide       | 1.9×1.8 ocean ceramics               | Two blue values, broad glaze, sparse perimeter wave; removed dense aqua stripes             |
| Olive      | 2.1×1.65 limestone/terracotta groups | Three-row offset, restrained irregular value grouping, olive mosaic only at perimeter       |
| Lantern    | 2.35×1.25 staggered street tiles     | Charcoal/redbrown, clear warm seams and restrained edge strip; removed diamond inlays       |
| Orbit      | 2.6×2.2 indigo panels                | Deep seams, small inset marks, occasional muted hazard marks at perimeter; no emissive grid |

Bevel and glaze are baked albedo cues, not displaced geometry or a normal map. This gives purposeful depth cues with the existing PBR shader and no extra floor draw calls. Tide roughness is 0.68, Little Sun 0.76, other floors 0.88, all nonmetallic. An artist-authored normal/roughness atlas remains future work.

Little Sun previously used a 1024×768 non-mipmapped canvas floor. Moving it to the same smaller mipmapped texture family helps offset the new shared face atlas. Follow/overview captures and actual floor crops are in the [comparison](CHAOTIC_POP_PASS2_COMPARISON.html). Physical OLED color, tile seam moiré and Safari filtering still need device review.
