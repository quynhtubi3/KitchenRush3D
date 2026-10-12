# Chaotic Pop Pass 2 — future character handoff

Rendering preparation only; no creator UI, wardrobe, inventory, ownership, currency, migrations or appearance-network protocol is introduced.

The articulated parents remain `root`, `head`, `torso`, `leftArm/rightArm`, `leftLeg/rightLeg`. Head parent is at `(0,1.3,0.015)` with a -0.22 rad upward face tilt; the skin shell is 0.88 units wide before its 1.08 width scale. The face patch spans x ±0.32 and y ±0.275 on the front hemisphere. Keep hair/hat replacements out of that region and test all 16 atlas cells. Toque extends roughly 0.9 above the head parent; hands/feet are 0.24/0.34 nominal diameters. Customer variants apply modest scale to the whole head assembly.

Hat/hair/face attach to head; coat/apron/back details to torso; hand accessories to arm transforms. The held-item root stays `(0,0.78,0.51)` relative to the chef root; it is currently outside the animated arm hierarchy. Model replacements must preserve that clearance and must not substitute predicted owner/recipe state. Apron cannot obscure the four team-colored coat/sleeve slots.

Static meshes merge per part/material while joints and face UV updates remain independent. Replacing clothes after merging requires rebuilding the affected part, not relying on individual original mesh names. Preserve the `team-coat` material slot and the one-per-actor expression surface. Reuse the shared face atlas; avoid one texture/material per expression or customer.

Future appearance synchronization needs an explicit validated cosmetic ID/protocol and deterministic asset version/fallback. Current rendering only uses existing server member slots and customer IDs. That later design must handle reconnect and ownership separately; this pass changes neither authentication nor persistence.

Before production customization: author clearer body/apron shapes, review overhead face readability, verify hat/hair clipping at all poses, build actor-targeted visual events if needed, and profile memory/draw calls on real phones. No Blender asset or skeletal-animation compatibility is certified by this procedural rig.
