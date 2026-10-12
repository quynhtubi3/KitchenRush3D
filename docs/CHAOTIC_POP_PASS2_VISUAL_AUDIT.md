# Chaotic Pop Pass 2 — visual audit

Internal screenshot assessment, 2026-10-12. Not a user study or final art approval. Scale: 1 obstructive/unfinished, 2 readable prototype, 3 coherent first production pass with clear defects, 4 convincing polished gameplay, 5 release-quality art confirmed at gameplay and close zoom.

| Area                | Baseline | Current provisional | Reason                                                                                                             |
| ------------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Floor               | 2        | 3                   | Large ceramic/panel rhythm replaces noisy/dense patterns; depth is still baked color, not authored relief          |
| Chef silhouette     | 2        | 3                   | Bigger hands/feet/head and wider apron, but still rounded procedural kit                                           |
| Facial personality  | 1        | 3                   | Eight visibly different mesh-attached atlas faces; subtle at overhead mobile zoom                                  |
| Equipment           | 2        | 2                   | Useful enlarged controls/grips; most bodies remain the established kit                                             |
| Restaurant identity | 3        | 3                   | New floor construction and cuisine mascot graphics support existing architecture; plaques are small overhead       |
| Material quality    | 2        | 2                   | Better ceramic values/roughness, but no baked AO/IBL/normal atlas                                                  |
| Food readability    | 2        | 3                   | Burger has a clearer crown/cheddar; many regional recipes share plated silhouettes                                 |
| Clutter             | 3        | 3                   | Fewer floor motifs; broad checker contrast still strong, labels/portrait framing remain existing limitations       |
| Cohesion            | 2        | 3                   | Food illustrations, face shapes and floor language now share the pop system; model family is not rebuilt wholesale |

Before/after live-scene images are in `screenshots/chaotic-pop-pass2-{before,after}/`. Five floor crops are crops of actual desktop gameplay, not external concept art. Offline face/customer/25-dish sheets are labeled asset studies and cannot establish gameplay completion. See [comparison](CHAOTIC_POP_PASS2_COMPARISON.html).

## Little Sun review and corrections

The first live slice showed wrong atlas orientation and hatching/self-shadow artifacts. The atlas UV convention was corrected; Poisson shadows received depth/normal bias. The checker was softened from deep chili/cream to terracotta/cream and grout thinned. Initial sheet framing overlapped character rows and reversed horizontal order; the offline study camera now has separate row spacing/aspect and disables its gameplay resize framing. Retina review found inverted poster graphics; standard-plane texture upload now flips Y. The user also identified a detached chopping-table shadow: legs were 0.05 units above the floor and excluded as tiny casters. Floor-reaching support geometry, merged leg shadows and a shared soft foot-contact batch correct that grounding without changing station roots or input.

The revised mobile follow capture shows readable chef eyes, empty/carry hands and clear station tops. Overview still makes the room/actors small in portrait and retains large vertical space; no camera-layout change is claimed. Posters are printed illustrations at the rear wall, not large UI overlays. Review at full screenshot size before accepting aesthetic quality.

## Acceptance status

**Partial art acceptance.** Main floor/face/performance systems are implemented, but wholesale appliance redesign, distinctive plating for all 25 dishes, a controlled pre-change facial study, full equipment/food/customer close-up pairs, bespoke action clips and real-device color/thermal validation remain open. Missing evidence is not replaced by fake gameplay or the fact that tests pass.
