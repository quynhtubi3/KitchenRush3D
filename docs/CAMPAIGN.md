# Campaign Pass 7 — 25 recipes across 50 shifts

The campaign contains five original kitchens with ten shifts each: Little Sun Diner, Tide Sushi House, Olive Garden Kitchen, Lantern Wok and Orbit Kitchen. `packages/content/src/campaign.ts` is the authored catalog; `validation.ts` checks executable recipe graphs. The original `little-sun-01` and `sunshine-burger` IDs remain stable.

Each shift has an explicit brief (localized name, duration, orders, spawn interval, patience, island layout). Restaurant layouts have different hot/cold/dispenser arrangements and colors. Variants relocate assembly/pass islands. All kitchens retain the same 15×11 pathfinding grid, one-slot processors, finite plates, two dining seats and FIFO queue. Equipment names and ingredients reflect the cuisine; active preparation, automatic cooking and automatic washing share engine behaviors.

## Recipe execution

The catalog keeps the original `little-sun-01` and `sunshine-burger` IDs, adds three distinct dishes per restaurant and now contains five playable dishes for each of the five kitchens. Recipes are server-executable graphs rather than notebook-only entries. Independent preparation branches can run at the same time; multi-step dishes reuse the existing board/mixer and stove/oven processors.

### Little Sun unlocks

| First available shift | Dish                  | New work                                                           |
| --------------------- | --------------------- | ------------------------------------------------------------------ |
| 1                     | Sunshine Burger       | Grill patty, chop lettuce, plate                                   |
| 2                     | Sunshine Cheeseburger | Slice cheese and add it to the existing burger build               |
| 3                     | Crispy Chicken Burger | Fry chicken while chopping lettuce                                 |
| 5                     | Toasted Burger        | Mix the side, then bake it; hot and cold branches stay independent |
| 10                    | Sunshine Fries        | Cut potatoes, fry them, and plate the side dish                    |

At shift 7 the four already-unlocked dishes appear in the same order pool. Shift 10 opens the fifth and completes the Little Sun menu. The four other restaurants follow the same release cadence: signature seared dish at shift 2, a two-stage crunchy dish at shift 3, the existing premium dish at shift 5, and a mixer/oven specialty at shift 10. Their dishes are Tide: Sushi, Seared Tuna Nigiri, Tide Tempura Roll, Tide Special Sushi, Tide Dragon Roll; Olive: Olive Pasta, Olive Chicken Pasta, Olive Bruschetta Pasta, Olive Special Pasta, Olive Garden Bake; Lantern: Lantern Noodles, Fire Wok Beef Noodles, Lantern Crispy Tofu, Lantern Special Noodles, Lantern Dumplings; Orbit: Orbit Bowl, Meteor Mushroom Bowl, Orbit Star Crisp, Orbit Special Bowl, Supernova Platter.

Runtime processors select a step by station ID and held input. The station stores its output, processing seconds and tap target; ticks execute passive work independently of chefs. Clicking a ticket selects the chef's next recipe; the first ingredient binds that recipe to the plate (otherwise assembly uses an eligible waiting customer). The binding follows the plate through pickup and clears after eating, while the chef's one-shot selection clears when an ingredient is accepted. This prevents a shorter recipe (such as Burger) from auto-completing while a larger build (Cheeseburger) is in progress. A completed plate identifies its exact recipe output, and service checks that output against the customer's server-assigned order. Dishes cannot be discarded to bypass plate recovery.

Validation checks Zod shapes, unique steps, cycles, missing dependencies, producer edges, item/equipment references, supported processing modes, unused branches and final assembly/component agreement. The level tests also check all station interactions are reachable from each of four spawn positions.

## Guests and tuning

Within each restaurant, dishes unlock at shifts 1, 2, 3, 5 and 10. Guest types continue to unlock at shifts 3 (VIP), 5 (complex), 6 (impatient) and 7 (combo bonus). Recipe selection is weighted by the level's authored `recipeWeights`, uses a deterministic seed derived from match ID and level ID, and avoids consecutive identical dishes when alternatives are available. Complex guests receive the longest eligible unlocked recipe after that no-repeat rule; regular and other non-complex guests sample the weighted menu. The server owns the selection in Solo and Multiplayer.

| Type        | Seated patience multiplier | Base score multiplier | Combo increase |
| ----------- | -------------------------- | --------------------- | -------------- |
| Regular     | 1                          | 1                     | 1              |
| VIP         | 1.15                       | 1.5                   | 1              |
| Impatient   | 0.72                       | 1.2                   | 1              |
| Complex     | 1.35                       | 1.3                   | 1              |
| Combo-bonus | 1                          | 1                     | 2              |

All types still queue, wait, eat and leave a dirty plate. Complex customers order the longer recipe. An expired customer breaks the team combo. There is no direct trash penalty.

First shifts last 180 seconds; later shifts last 240–360 seconds, with 210-second transition shifts in Little Sun. The configured duration is a time limit, not a forced minimum: a skilled team can vote to finish early. At match start, each additional chef adds 60 seconds, one required order, 110 required points, shortens spawn interval by four seconds (floor 12), and adds one plate (cap four). These parameters remain frozen when players disconnect.

One star requires both score and order targets. Two stars require the second score threshold. Three stars require the third score threshold plus the configured maximum missed guests, average service time and minimum best combo. Thresholds are level data; three-star limits appear in the recipe notebook. More than one star is never required to unlock content.

## Local progression

The menu exposes all fifty levels and disables locked entries. Winning the current frontier unlocks the next level; shift 10 unlocks the next restaurant. Replays do not erase wins or lower stored stars. The client records only received winning results carrying a level ID. A failed match does not unlock anything. Tutorial hints react to cooking and dirty plates, are dismissible, and never pause co-op.

Progress is stored in `kr-campaign-wins` and `kr-stars-<levelId>` in localStorage. This is device-local convenience, not authenticated account progress. The server validates level IDs and owns all match results, but has no account-based unlock authorization until phase 4. A private host can invite guests to its chosen unlocked level; a guest who has not reached that frontier does not skip its own unlock chain. Public queues are partitioned by level and team size. No currency, account or leaderboard is fabricated.

## Verification boundaries

`tests/campaign.test.ts` runs 200 complete matches (50 × 1/2/3/4) through normal intents and fixed 50ms simulation ticks, plus cooks and serves each of the 25 recipes through real processors. It does not edit timers, positions, inventory, score, customers or results. It checks winning outcomes, unique ownership and conservation of plates. For teams, these simulations are in-process, not 200 network/browser matches.

`tests/e2e/campaign.spec.ts` loads every level in real Chromium and cooks/serves one basic dish per cuisine. Its localStorage fixture unlocks navigation only; match state/results are never injected. The existing Solo E2E wins the first shift and checks the genuine unlock persists after reload. The co-op E2E uses two browsers in one live match to cook/serve a dish and verify synchronized state; unanimity rules are verified by session tests. See PROGRESS for results of actual runs.

The existing seed script imports the same validated catalog and can upsert fifty levels and twenty-five recipes. No database schema or account work was added in Pass 7; database execution was not used to verify the Guest campaign. Existing level and recipe IDs were retained, and new recipes receive stable IDs.
