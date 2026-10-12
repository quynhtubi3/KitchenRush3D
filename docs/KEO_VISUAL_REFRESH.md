# Kẹo — visual refresh

## What changed

- Reworked the body pose so the torso sits on its legs instead of hovering from a doubled vertical offset. Added a broad head, integrated vertex-color calico mask, tapered rounded ears with visible pink centers, warm iris rings, smaller pupils, soft muzzle, button nose and fine whiskers.
- Replaced three visibly segmented tail pieces with one curved tapered mesh carrying orange, silver and dark tabby markings. Moved the gold collar and green charm with the head pose; added a small pre-rendered contact shadow.
- Added a slow blink, subtle breathing, calmer tail motion and an alternating diagonal gait. Animation updates transforms only; fur texture, materials and meshes are created once when the restaurant scene is built.
- Reduced Kẹo's standalone geometry from **27 meshes / 37,582 triangles** to **25 meshes / 17,476 triangles** in a matched Babylon preview. That is about **53.5% fewer triangles**. These counts describe Kẹo only; they do not predict device frame rate or temperature.

## Screenshots

The `before-*` and `after-*` images use the same local Babylon asset preview, camera, floor and lighting. They show Kẹo's standing, resting, top and walking poses, plus a portrait frame. They are model-review captures rather than game screenshots.

Production-client screenshots from a local guest-only server are also included at 1440×1000 and 390×844. Both startup/gameplay captures reported zero JavaScript page errors. The production browser used Chromium SwiftShader to capture them, so its FPS figures are not mobile GPU benchmarks.

## Limits

- This is a procedural cartoon model, not a hand-authored or scanned production asset. The texture and large eye proportions may still need an art review and another polish pass.
- Chromium captures verify rendering and layout in those browser viewports only. Kẹo's appearance, Retina clarity, frame rate and heat still need direct review on a real iPhone.
- No gameplay simulation, collision, station layout, cat eligibility rule, or multiplayer state changed.
