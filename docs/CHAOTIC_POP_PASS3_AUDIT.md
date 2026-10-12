# Chaotic Pop Pass 3 — audit

2026-10-12. Initial audit of the actual Pass 2 production build. See the separate Pass 2 verification record for its final full-suite result. This document does not promote partial art acceptance to completion.

## What exists

All five floors have authored layouts evaluated in world proportions: ceramics, offset stone, street brick and industrial panels. They are one textured ground each, with baked albedo edge cues, not displaced tile geometry. Chef/customer faces share an original eight-expression atlas with blink variants. The chef has articulated head/torso/arm/leg transforms and an existing held root; these are procedural parts, not a production skeleton or imported GLB. The GLB loader exists but no production GLB is installed.

Pass 2 improves chef proportions, selected appliance controls, burger/cheddar, cuisine wall plaques and pooled comic bursts. Most equipment bodies and regional plating remain the earlier kit. Customers have stable head/hair variants and snapshot-driven expressions. Mobile cadence, shadow refresh and food batching reduce workload separately from Retina resolution.

The floating chopping-table report exposed real defects: legs ended above the floor and were omitted from shadow casters. Pass 2 corrected those and added a shared soft contact batch. Inspection also finds floor planes below the nominal feet plane and some cabinet bases above it. That remaining grounding mismatch needs a consistent visual floor plane.

## Screenshot assessment and priorities

Assessment uses actual Pass 2 desktop/portrait/follow images, carried burger, expression/customer/food sheets. It is an internal art review, not user research, native Safari evidence or aesthetic approval.

| Priority | Finding                                                                                    | Targeted action                                                                                                |
| -------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| P0       | Furniture grounding is inconsistent between floor planes, worktable feet and cabinet bases | Align visual floor/feet; keep station roots and navigation intact; extend the existing contact batch           |
| P1       | Tide/Lantern cast shadows are heavy and long against dark tiles                            | Use the existing two lights with controlled fill/key balance, softer shadow opacity and restrained theme tints |
| P1       | Several wood, cloth, food and enamel parts inherit similar default finishes                | Introduce explicit cached material archetypes, separate food from ceramic and fabric from metal                |
| P1       | Regional finished recipes often share the same silhouette despite different components     | Add recognizable component-based plating differences without changing recipe data                              |
| P1       | Character parts are merged without explicit replaceable asset slots                        | Prepare hat/hair/apron attachment groups and an art contract; do not build wardrobe or ownership               |
| P2       | Wall/floor transitions look flat from the overhead camera                                  | Add restrained plinth/trim/contact relationships with existing batching                                        |
| P2       | Portrait has limited wall visibility and a broad checker dominates empty floor             | Preserve camera benefits and floor layouts; review controlled captures rather than arbitrarily zooming         |
| P3       | Sculpted models, baked normals/IBL and bespoke action clips are absent                     | Document production asset gaps and real-device review requirements                                             |

The existing HUD already shares ink/paper/accent tokens, bold buttons and order tickets with the world. This pass should preserve its mobile coverage and controls. No evidence justifies a new gameplay camera, heavy SSAO, bloom stack or decorative UI expansion.

## Evidence rules

Additional capture discovered P0: 1920×1080 touch uses phone landscape framing with a desktop HUD, hiding the top board row. Correct profile selection for wide/tall touch landscape, matching the existing 600px compact-landscape CSS boundary. Preserve phone portrait/landscape and mouse/keyboard framing. Verify actual board-label clearance below the HUD; label/crop evidence must not hide this defect.

Pass 3 baseline is copied from the final Pass 2 production captures, with provenance retained. Additional missing viewports must be captured from that same build before rendering changes. Offline asset sheets remain explicitly labeled; they are not gameplay. Matching restaurant/level/camera/viewport/profile comparisons are required. Customer arrival times and real-time frames can differ, so comparisons are not pixel-identical state replays.

Final verification and known limitations belong in [implementation](CHAOTIC_POP_PASS3_IMPLEMENTATION.md). A clean build/test result does not establish attractive art or iPhone thermal safety.
