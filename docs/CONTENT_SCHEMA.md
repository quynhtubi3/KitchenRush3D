# Content schema

Source of truth: `packages/content/src/index.ts` preserves the original schemas and IDs (`little-sun-01`, `sunshine-burger`); `campaign.ts` owns five restaurants, fifty levels, ten recipes, items, guests and team scaling. Current content version is 2 in PostgreSQL seed. Changing a recipe ID requires an explicit migration strategy for future progress records. See [CAMPAIGN.md](CAMPAIGN.md).

`recipeSchema` validates localized names, steps, input/output item IDs, station types, dependency IDs, processing times, active tap counts, dish components, eating duration and base score. It rejects duplicate step IDs, missing dependencies and dependency cycles. `validateContent()` also validates station coverage, unique IDs, unique occupied tiles and map bounds.

`levelSchema` validates duration, score/order goals, plate count, patience, queue capacity, spawn interval, wash/burn timers, speed and scoring/star parameters. Station definitions carry ID, type, grid coordinates and optional dispenser ingredient. Runtime occupancy lives in the server state, never the content definition.

The simulation executes the validated recipe subset: single-input active processors, single-input automatic processors, dependency chains through intermediate items, independent branches and final plate assembly. `validation.ts` rejects unknown references, ambiguous processors, missing producer edges, unsupported processing modes, unused branches and assembly/component mismatch. Processors retain one slot; multi-slot processing is not supported. Tests check all station interactions are reachable from four spawns and win all fifty levels with normal intents.

Levels add restaurant ID, local shift number, localized name, recipe menu, guest sequence, station layout and tutorial flag. Team scaling resolves once at match start. Snapshots and results carry a level ID. Without a configured PostgreSQL database, local wins/stars provide Guest progression. With the phase 4.1 account API enabled, only server-recorded wins unlock levels; legacy local progress is archived as unverified and does not grant unlocks.

Database seed upserts only validated content inside a transaction. Re-running seed does not duplicate content. It does not seed fake scores or accounts.
