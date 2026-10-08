# Campaign 0.3

The campaign contains five original kitchens with ten shifts each: Little Sun Diner, Tide Sushi House, Olive Garden Kitchen, Lantern Wok and Orbit Kitchen. `packages/content/src/campaign.ts` is the authored catalog; `validation.ts` checks executable recipe graphs. The original `little-sun-01` and `sunshine-burger` IDs remain stable.

Each shift has an explicit brief (localized name, duration, orders, spawn interval, patience, island layout). Restaurant layouts have different hot/cold/dispenser arrangements and colors. Variants relocate assembly/pass islands. All kitchens retain the same 15×11 pathfinding grid, one-slot processors, finite plates, two dining seats and FIFO queue. Equipment names and ingredients reflect the cuisine; active preparation, automatic cooking and automatic washing share engine behaviors.

## Recipe execution

The basic recipe has independent hot and cold branches, plus a raw side. Premium recipes replace that side with an active two-tap mixing step followed by an automatic oven step. This introduces a real dependency chain while the hot/cold branches can run in parallel. Ten recipes are executable, not just notebook entries.

Runtime processors select a step by station ID and held input. The station stores its output, processing seconds and tap target; ticks execute passive work independently of chefs. Assembly accepts only components consistent with at least one recipe on the current menu. A completed plate identifies the recipe output; service checks that output against the actual customer's order. Dishes cannot be discarded to bypass plate recovery.

Validation checks Zod shapes, unique steps, cycles, missing dependencies, producer edges, item/equipment references, supported processing modes, unused branches and final assembly/component agreement. The level tests also check all station interactions are reachable from each of four spawn positions.

## Guests and tuning

Within each restaurant: shifts 1–2 introduce its recipe; shift 3 introduces VIP; shift 5 introduces premium complex orders and mixer/oven; shift 6 introduces impatient guests; shift 7 adds combo-bonus guests. Spawning cycles deterministically through the unlocked types, making testing and tuning reproducible.

| Type        | Seated patience multiplier | Base score multiplier | Combo increase |
| ----------- | -------------------------- | --------------------- | -------------- |
| Regular     | 1                          | 1                     | 1              |
| VIP         | 1.15                       | 1.5                   | 1              |
| Impatient   | 0.72                       | 1.2                   | 1              |
| Complex     | 1.35                       | 1.3                   | 1              |
| Combo-bonus | 1                          | 1                     | 2              |

All types still queue, wait, eat and leave a dirty plate. Complex customers order the longer recipe. An expired customer breaks the team combo. There is no direct trash penalty.

First shifts last 180 seconds; later shifts last 240–360 seconds, with 210-second transition shifts in Little Sun. The configured duration is a time limit, not a forced minimum: a skilled team can vote to finish early. At match start, each additional chef adds one required order and 110 required points, shortens spawn interval by four seconds (floor 12), and adds one plate (cap four). These parameters remain frozen when players disconnect.

One star requires both score and order targets. Two stars require the second score threshold. Three stars require the third score threshold plus the configured maximum missed guests, average service time and minimum best combo. Thresholds are level data; three-star limits appear in the recipe notebook. More than one star is never required to unlock content.

## Local progression

The menu exposes all fifty levels and disables locked entries. Winning the current frontier unlocks the next level; shift 10 unlocks the next restaurant. Replays do not erase wins or lower stored stars. The client records only received winning results carrying a level ID. A failed match does not unlock anything. Tutorial hints react to cooking and dirty plates, are dismissible, and never pause co-op.

Progress is stored in `kr-campaign-wins` and `kr-stars-<levelId>` in localStorage. This is device-local convenience, not authenticated account progress. The server validates level IDs and owns all match results, but has no account-based unlock authorization until phase 4. A private host can invite guests to its chosen unlocked level; a guest who has not reached that frontier does not skip its own unlock chain. Public queues are partitioned by level and team size. No currency, account or leaderboard is fabricated.

## Verification boundaries

`tests/campaign.test.ts` runs 200 complete matches (50 × 1/2/3/4) through normal intents and fixed 50ms simulation ticks. It does not edit timers, positions, inventory, score, customers or results. It checks winning outcomes, unique ownership and conservation of plates. For teams, chefs take different preparation/serving roles; these tests are in-process, not 200 network/browser matches.

`tests/e2e/campaign.spec.ts` loads every level in real Chromium and cooks/serves one basic dish per cuisine. Its localStorage fixture unlocks navigation only; match state/results are never injected. The existing Solo E2E wins the first shift and checks the genuine unlock persists after reload. The co-op E2E completes a real two-browser match; network tests cover the other team sizes and non-default kitchens. See PROGRESS for results of actual runs.

Database seed now upserts fifty levels and ten recipes as content version 2. PostgreSQL execution is still unverified in this environment. Future persistent progress should preserve these IDs and migrate explicitly if IDs change.
