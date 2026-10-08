# Architecture

## Current vertical slice

Browser → Colyseus `intent` → room validation/rate limit → pure `Game` simulation → Schema snapshot → Babylon render + HTML HUD.

The Solo room has `maxClients = 1`. Every gameplay mutation runs sequentially in one Node event loop. Item transfers clear exactly one owner and assign exactly one destination. The client cannot submit score, elapsed time, recipes, inventory or results. Unknown players, malformed numbers, unknown stations, out-of-range interactions and inputs after completion are ignored safely.

The server ticks at 20 Hz. A 250 ms maximum integration step avoids teleportation after a process stall; under a severe stall simulation time deliberately runs slower than wall time. BFS uses a 15×11 tile grid, cardinal adjacency and blocked station tiles. New clicks replace the pending path and action. Arrival revalidates station and hand state.

Colyseus 0.18 uses `onDrop` for temporary disconnects and a 20-second seat reservation. Solo simulation pauses while disconnected and restores its previous playing/paused state. Explicit leave disposes the room. Client reconnect tokens live in sessionStorage; local result data is untrusted and never sent to a competitive service.

Schema contains a typed string snapshot of the world. This keeps simulation independent of network types, but costs bandwidth. Entity-level Schema fields/deltas remain an optimization before production scaling. Clients interpolate authoritative chef positions; cameras remain independent.

## Multiplayer (phase 2)

`CoopRoom` is transport/lifecycle glue. `KitchenSession` owns lobby/host/ready/votes/social rules and delegates cooking, navigation, inventory, customer/plate state and score to the same `Game` used by Solo. `protocol.ts` parses supported gameplay intents. No client-submitted score/config/result is accepted.

`coop_private` uses unlisted/private Colyseus rooms and the room ID as the invitation code. `coop_public` filters matchmaking by validated numeric `teamSize` (2, 3, 4) and `levelId`. Private rooms require at least two ready members; public rooms require the full selected team. Membership changes reset readiness. Only the host may select an available content ID or explicitly start. All fifty validated levels are executable. Public lobbies keep their matched level; private hosts can change it before readiness. At start, `lock()` blocks late joins, and targets/timers/plate count are frozen from the starting team size.

Temporary drops mark a chef disconnected and clear pending movement/action; the shared game continues. The first connected member becomes host, without reassignment back on reconnect. The same chef/item is retained for 20 seconds. Permanent leave or expiration removes the chef and moves the held item into the pass counter or its FIFO recovery stock; pickup drains that stock in order. It never creates a new plate or discards a dirty one. Chefs have soft overlap (they can pass through one another); station/wall path blocking and server interaction range still apply, avoiding player blocking deadlocks.

Votes are tied to connected session IDs and accepted only after both goals. Dropping/leaving removes that vote and reevaluates unanimity over active members. Zero active members never auto-finalize through voting. Reconnect clears the returning member's old vote. Timer expiration finalizes normally. The result records starting team size even after departures.

Communication is a whitelist of four quick chats, three emotes and station-ID pings. Only validated fields are broadcast, sender IDs and six-second expiry come from the server, one social message/second/member, at most eight active signals. All intents share a 15 messages/second/member limit; WebSocket payloads are limited to 4096 bytes. Lobby lifetime is ten minutes and Colyseus disposes empty rooms. Client reconnect has one retry owner (the app), avoiding competing SDK/manual retries.

No account identity, reward grant or leaderboard is introduced by this milestone. Local co-op result keys are separate from Solo best results. Multi-process matchmaking/presence, persistent active rooms and production load testing are later deployment work.

## Content and persistence

`packages/content` owns validated recipe DAGs, fifty layouts/briefs, guest definitions and balancing. `Game` resolves the level ID once and executes processors from the selected recipe steps. The client rebuilds kitchen geometry and labels on level changes. Results carry level IDs; device-local win/star records implement sequential unlocks without account claims. See CAMPAIGN.md for validation and persistence boundaries. `packages/shared` owns serializable state/intent types. Runtime imports are bundled by Vite/esbuild. `database/` uses typed node-postgres calls, parameterized queries and versioned SQL migrations; it is groundwork only in phase 1. No reward or account endpoint exists yet.

Phase 4 must implement transactional match finalization, participant eligibility, unique grants, row-locked purchases and authenticated server-side progress before any economy UI is exposed. A unique ledger key alone is not a completed reward system.

## Rendering

All required 3D assets are authored as Babylon meshes. The game has no model downloads or missing-GLB failure path. A clear error replaces the UI if WebGL cannot initialize. Tap targets use projected HTML labels in addition to mesh picking. Per-client camera zoom/follow changes no simulation data. Low back walls and an open front keep the kitchen visible; generalized dynamic occluder fading is not implemented.

## References

Implementation checked against the [Colyseus room API](https://docs.colyseus.io/room) and [lifecycle documentation](https://docs.colyseus.io/room/lifecycle), plus installed package source for Schema field tracking and reconnect behavior.
