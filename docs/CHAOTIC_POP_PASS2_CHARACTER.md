# Chaotic Pop Pass 2 — character presentation

The existing articulated rig remains: root, torso, head, two arms and two legs. Gameplay transforms and held-item ownership remain server authoritative.

## Shapes and expressions

Head shell diameter increases 0.81→0.88 units, with width scale 1.03→1.08 and a slight upward face tilt. Torso is shorter/full-bodied; apron waist panel is wider; hands 0.20→0.24, shoes 0.30→0.34. Toque crown is slightly wider/asymmetric. Customer head proportions vary modestly from their stable ID-derived hairstyle variant. Four existing coat colors remain slot based.

The many eye/pupil/brow/smile meshes and two blinking lids are replaced with one curved expression surface per actor and a **shared 512×512 RGBA atlas**. Sixteen cells contain neutral, happy, focused, confused, panic, proud, disappointed and exhausted, plus their closed-eye variants. Original canvas paths draw different eyes/brows/mouths; UV buffers update only when mood/blink changes. Nose/cheeks/ears remain modeled. The atlas uses unlit alpha-test PBR, not emoji or per-frame texture painting.

Snapshot selection: nearby burnt station→panic; nearby active work→focused; confirmed pickup pulse→happy; service pulse or won result→proud; failed result→disappointed; late clock→exhausted. Confused can accompany a confirmed changed chef signature and invalid/blocked event; global events without a local pulse do not automatically animate every teammate. It is a coarse presentation heuristic, not a new actor-targeted event protocol. There is no prediction of gameplay success.

Customers reuse actual Waiting/Eating/Leaving state and patience. Eating is happy; a departure after observed Eating is proud, otherwise disappointed. Stable hair variants, type accessories and seated posture remain. No new NPC simulation or patience rules.

## Animation and limits

Idle sway, walk leg/arm swing, carry reach, cutting/work pulses and wash/service reach use the existing lightweight transforms. More visible torso squash/width compensation and small expression-related head pose strengthen personality. Reduced Motion removes blinking, bob/squash/head oscillation and pooled VFX; static facial state and carry posture remain readable.

No skeleton clips, finger grip, unique cook/mix clip, look-at system or actor-targeted success/failure stream was added. Some work reactions share the same pulse animation. Chef facing still follows movement rather than turning to every station. The held anchor stays `(0, 0.78, 0.51)`; cooking items are not independently predicted or moved between owners by animation.

[Runtime face sheet](screenshots/chaotic-pop-pass2-after/faces-asset-study.png) is an offline mesh study, explicitly labeled, not multiplayer/gameplay proof. Live room shots and animation frames are separate in the comparison.
