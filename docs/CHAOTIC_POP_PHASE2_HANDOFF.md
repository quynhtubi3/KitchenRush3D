# Chaotic Pop — handoff to Phase 2

This pass establishes the shared visual identity and applies it to all five existing restaurants. It is safe to build later customization on top of the exported palette table without changing the game simulation.

## Reuse

- Import `restaurantPopThemes` / `restaurantPopTheme()` from `apps/client/src/game/chaotic-pop-theme.ts` for any future cosmetic preview or restaurant selection card.
- Continue to render the existing 3D preview from the selected restaurant theme; keep cosmetic selection client-only until a separate persistence design is approved.
- Keep chef-slot colors readable against dark HUD and pale paper cards.
- Reuse the room's accent and secondary colors for cosmetic framing, while preserving explicit warning/ready states and WCAG-readable text combinations.

## Character creator constraints

- Keep the shared chibi rig proportions: the head parent is at `y=1.3`, face/hair silhouettes are about `0.81–0.84` units across, and torso/legs remain visibly smaller than the head. Small animation pulses must not change hit targets or station reach.
- Treat `head` as the attachment parent for toque, hair and accessories. The toque rises about `0.9` units above that parent; hats/hair must not cover eyes/brows or collide with the toque silhouette from the isometric camera.
- The held-item anchor is near `(0, 0.78, 0.51)` relative to the chef root. Accessories should not cover the hand or food silhouette.
- Preserve four high-contrast multiplayer coat colors by slot. A creator may offer the approved palette, but player identification must also keep its slot marker/icon.
- Keep eye whites, pupils, brows and smile inside the current front-facing face region. Hair/accessories can decorate the top, back and side without obscuring that region.
- Do not add ownership, inventory, unlocks, saved selections or wardrobe state as part of this art pipeline. A later creator needs its own data/protocol proposal.

## Still needed before calling the art final

- Review the before/after screenshots at full size and provide feedback on Little Sun and the other four restaurant identities.
- Check the built page on Safari/iPhone 13 and iPhone 14 Pro Max; compare text/edge sharpness and confirm the colors do not appear overexposed on the OLED panel.
- Replace the remaining simple procedural chefs, NPCs, appliances and recipe plating with original authored assets only after licensing, mobile memory, loading fallback and multiplayer consistency are covered.
- Profile a real mid-range iPhone and Android device. Do not use SwiftShader's low FPS as a hardware estimate.
- Recheck color-blind/status readability and crowded order-card cases before adding cosmetic unlock UI.

This handoff does not enable or develop account cosmetics, currencies, shops, achievements, friends, leaderboards, or PostgreSQL changes.
