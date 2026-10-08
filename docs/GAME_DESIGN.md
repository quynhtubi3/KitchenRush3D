# Game design — Little Sun Diner 01

An original small sunlit diner. One chef, two dining seats, two reusable plates, three queue slots, a grill, chopping board, plating counter, pass counter, ingredient dispensers, dish rack, automatic sink and trash.

The Sunshine burger requires a bun, a grilled patty and chopped lettuce on a plate. Grilling and chopping are independent graph branches. Placement, processing, pickup, plating and delivery are separate contextual actions. Chopping needs three additional clicks; leaving lettuce on the board does not process it automatically.

## Balance

| Parameter                 |                   Value | Reason                                |
| ------------------------- | ----------------------: | ------------------------------------- |
| Shift                     |                   180 s | Short first-level session             |
| Goal                      | 220 points AND 2 orders | Exercises full recipe twice           |
| Cook / ready-to-burn      |                7 / 14 s | Time to prep lettuce in parallel      |
| Wash / eat                |                 5 / 6 s | Visible asynchronous plate loop       |
| Seated patience           |                   105 s | Gives beginners recipe-reading time   |
| Queue patience / capacity |                65 s / 3 | Finite backpressure                   |
| Arrival interval          |                    24 s | Introduces cleanup pressure gradually |
| Plates                    |                       2 | Scarce from level 1                   |
| Movement                  |               5 tiles/s | Responsive click navigation           |

All these values live in `packages/content/src/index.ts`.

For a successful delivery: `round((100 + 40 × remainingPatience/maxPatience) × (1 + min(0.75, (combo−1) × 0.15)))`. Successful delivery increments combo; a queue/seated timeout resets it. Trash and invalid interactions subtract no points.

Victory requires both goals. One star: victory. Two stars: at least 440 points. Three stars: at least 680 points, no more than one lost guest, mean waiting-to-service no greater than 55 seconds, and best combo at least three. Star thresholds and service limits are configurable. Early finish is available only after both goals; otherwise the shift continues until timeout.

Customer states: Arriving → Queueing → Seated → WaitingForFood → Eating → Leaving. Dirty plate is created at departure and persists. A seat with a dirty plate cannot admit a guest. Pickup frees the seat immediately; washing does not control seat availability. The same item ID survives plate → burger → dirty plate → clean plate.

## Limits and subsequent design work

The first slice has one recipe and no special customer types. Tutorial is a recipe notebook plus initial instruction, not a fully adaptive tutorial. No throwing, spoilage, fire spread, pay-to-win or direct trash penalty. Other restaurants, level unlocks and team scaling remain later-phase work.
