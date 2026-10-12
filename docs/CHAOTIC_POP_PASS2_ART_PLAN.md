# Chaotic Pop Pass 2 — art and mobile workload

2026-10-12. The user's iPhone heat report is a constraint for this pass, alongside clearer floors and character personality. This is an original procedural production pass, not final art approval.

## Baseline and decisions

Read the existing art/audit/implementation/handoff, README, PROGRESS, asset manifest, comparison and render/rig/quality code. No AGENTS.md was found in the workspace or its ancestors. Blender was not available on PATH. Keep the working Babylon/glTF fallback pipeline; do not claim new production GLBs.

Fresh baseline: 13 production browser tests captured five restaurant overviews on desktop/mobile, follow cameras, Little Sun menu/compact portrait/landscape/close-up, High profile and a natural defeat. Files: `screenshots/chaotic-pop-pass2-before/`. These tests did not cook a baseline dish. Older actual food/crew/victory screenshots remain historical references, not controlled new baseline captures.

The existing render loop ran at display cadence; a 120 Hz display could submit considerably more frames than needed. Balanced used blurred shadow maps. Performance changes must preserve the independent Retina buffer calculation, HTML HUD, server clock and touch picking.

## Production sequence and review

1. Replace noisy Little Sun terrazzo with large warm checker ceramics; replace face components with a shared atlas and strengthen head, hands, feet, apron and toque.
2. Capture Little Sun desktop/mobile in a real room. Review identified inverted face UVs and shadow acne; fix UV mapping, add shadow bias and soften the floor's red/cream values before final capture.
3. Extend the same low-cost floor pipeline to ocean ceramics, irregular terracotta/limestone, staggered street tiles and indigo industrial panels. Shared chef/customer rig receives the face system; each restaurant receives its own illustrated food plaques.
4. Merge food components by material, remove tiny food shadow casters, reuse completion-effect slots for comic bursts, reduce mobile render/shadow cadence without changing resolution.
5. Capture runtime asset studies and live kitchens; check Reduced Motion/profiles/lifecycle, then run the full production E2E suite. Verification is recorded in IMPLEMENTATION and PROGRESS.

## Remaining art scope

The pass changes authored texture layout, face geometry/atlas, selected proportions, large appliance details and burger silhouette. It does not supply artist-sculpted characters, a new appliance family or 25 bespoke food meshes. Full Pass 2 quality acceptance stays **partial** until the missing comparisons/food differentiation/physical-device review are addressed. Passing tests cannot decide whether the art is attractive.
