# Optional original GLB models

This directory is reserved for project-owned or clearly licensed GLB files. No downloaded or authored production model is included yet; the live game continues to use its tested procedural art as its fallback.

The client exposes a scene-scoped `ModelAssetLibrary` that lazy-loads Babylon's glTF 2.0 loader, caches each GLB once, creates independent scene instances and disposes instances with the scene. Before adding a model, record its source, license, author, texture size and expected triangle count in `docs/ASSET_MANIFEST.md`.

Use meters-like kitchen dimensions, +Y up and a compact origin centered beneath the object. Keep materials PBR-compatible, apply transforms, embed required textures in the GLB, and test a low-end mobile build. Avoid tiny decorative geometry that is invisible at the isometric match camera.
