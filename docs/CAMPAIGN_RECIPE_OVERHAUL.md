# Pass 7 — Campaign and recipe overhaul

Status: implementation and verification in progress (2026-10-11). Guest-only; no database required. Stable level IDs, win/star storage and sequential progression are unchanged.

## Audit and implementation

Baseline source audit: 45 named item definitions and ten recipes, two per restaurant; the current catalog has 91 named item definitions and 25 recipes. Counts include intermediates and finished dishes, not only raw ingredients. The current fifty maps expose 26 distinct dispenser ingredients. Shifts 1?4 listed the base recipe; shifts 5?10 listed base and premium. The order generator selected the base for ordinary customers and the last recipe for complex customers. This was both a content limitation and an order-generation limitation. Order cards and the recipe hero also reused a burger icon.

The catalog now contains 25 recipes, five per restaurant. New dispensers supply cheese/chicken/potatoes and regional ingredients. Board and mixer perform active preparation; stove and oven perform timed cooking; each recipe ends in plate assembly. Independent branches and chained preparation use the existing validated graph engine. No multi-slot processor or new currency system was added.

Weighted, seeded sampling runs on the server, excludes consecutive repeats when alternatives exist, and restricts complex customers to the longest eligible graph. Clicking an order selects that chef's preferred recipe on the server. The first component binds the plate to that recipe; competing chefs cannot silently change an in-progress plate. The binding follows carried plates and clears when eating leaves a dirty plate. Without an explicit selection, assembly follows an eligible waiting customer.

Procedural visuals now distinguish cheese/chicken burgers, fries, sushi, pasta, noodles/dumplings and space bowls, with new raw/prepared ingredients. Icons are emoji, not production food portraits. Several regional variants still share their main plated silhouette; further visual differentiation is pending.

## Fifty-level menu audit

Baseline column lists recipes reachable through the old ordinary/complex guest rules, not just declared data. New column lists weighted menu entries (weight in parentheses). Complex selection and no-repeat affect realized proportions.

| Level         | Before                          | Current menu                                                                                                        |
| ------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| little-sun-01 | sunshine-burger                 | sunshine-burger (4)                                                                                                 |
| little-sun-02 | sunshine-burger                 | sunshine-burger (4), sunshine-cheeseburger (3)                                                                      |
| little-sun-03 | sunshine-burger                 | sunshine-burger (4), sunshine-cheeseburger (3), sunshine-chicken-burger (2)                                         |
| little-sun-04 | sunshine-burger                 | sunshine-burger (4), sunshine-cheeseburger (3), sunshine-chicken-burger (2)                                         |
| little-sun-05 | sunshine-burger, toasted-burger | sunshine-burger (4), sunshine-cheeseburger (3), sunshine-chicken-burger (2), toasted-burger (2)                     |
| little-sun-06 | sunshine-burger, toasted-burger | sunshine-burger (4), sunshine-cheeseburger (3), sunshine-chicken-burger (2), toasted-burger (2)                     |
| little-sun-07 | sunshine-burger, toasted-burger | sunshine-burger (4), sunshine-cheeseburger (3), sunshine-chicken-burger (2), toasted-burger (2)                     |
| little-sun-08 | sunshine-burger, toasted-burger | sunshine-burger (4), sunshine-cheeseburger (3), sunshine-chicken-burger (2), toasted-burger (2)                     |
| little-sun-09 | sunshine-burger, toasted-burger | sunshine-burger (4), sunshine-cheeseburger (3), sunshine-chicken-burger (2), toasted-burger (2)                     |
| little-sun-10 | sunshine-burger, toasted-burger | sunshine-burger (4), sunshine-cheeseburger (3), sunshine-chicken-burger (2), toasted-burger (2), sunshine-fries (1) |
| tide-01       | tide-dish                       | tide-dish (4)                                                                                                       |
| tide-02       | tide-dish                       | tide-dish (4), tide-signature-a (3)                                                                                 |
| tide-03       | tide-dish                       | tide-dish (4), tide-signature-a (3), tide-signature-b (2)                                                           |
| tide-04       | tide-dish                       | tide-dish (4), tide-signature-a (3), tide-signature-b (2)                                                           |
| tide-05       | tide-dish, tide-premium         | tide-dish (4), tide-signature-a (3), tide-signature-b (2), tide-premium (2)                                         |
| tide-06       | tide-dish, tide-premium         | tide-dish (4), tide-signature-a (3), tide-signature-b (2), tide-premium (2)                                         |
| tide-07       | tide-dish, tide-premium         | tide-dish (4), tide-signature-a (3), tide-signature-b (2), tide-premium (2)                                         |
| tide-08       | tide-dish, tide-premium         | tide-dish (4), tide-signature-a (3), tide-signature-b (2), tide-premium (2)                                         |
| tide-09       | tide-dish, tide-premium         | tide-dish (4), tide-signature-a (3), tide-signature-b (2), tide-premium (2)                                         |
| tide-10       | tide-dish, tide-premium         | tide-dish (4), tide-signature-a (3), tide-signature-b (2), tide-premium (2), tide-signature-c (1)                   |
| olive-01      | olive-dish                      | olive-dish (4)                                                                                                      |
| olive-02      | olive-dish                      | olive-dish (4), olive-signature-a (3)                                                                               |
| olive-03      | olive-dish                      | olive-dish (4), olive-signature-a (3), olive-signature-b (2)                                                        |
| olive-04      | olive-dish                      | olive-dish (4), olive-signature-a (3), olive-signature-b (2)                                                        |
| olive-05      | olive-dish, olive-premium       | olive-dish (4), olive-signature-a (3), olive-signature-b (2), olive-premium (2)                                     |
| olive-06      | olive-dish, olive-premium       | olive-dish (4), olive-signature-a (3), olive-signature-b (2), olive-premium (2)                                     |
| olive-07      | olive-dish, olive-premium       | olive-dish (4), olive-signature-a (3), olive-signature-b (2), olive-premium (2)                                     |
| olive-08      | olive-dish, olive-premium       | olive-dish (4), olive-signature-a (3), olive-signature-b (2), olive-premium (2)                                     |
| olive-09      | olive-dish, olive-premium       | olive-dish (4), olive-signature-a (3), olive-signature-b (2), olive-premium (2)                                     |
| olive-10      | olive-dish, olive-premium       | olive-dish (4), olive-signature-a (3), olive-signature-b (2), olive-premium (2), olive-signature-c (1)              |
| lantern-01    | lantern-dish                    | lantern-dish (4)                                                                                                    |
| lantern-02    | lantern-dish                    | lantern-dish (4), lantern-signature-a (3)                                                                           |
| lantern-03    | lantern-dish                    | lantern-dish (4), lantern-signature-a (3), lantern-signature-b (2)                                                  |
| lantern-04    | lantern-dish                    | lantern-dish (4), lantern-signature-a (3), lantern-signature-b (2)                                                  |
| lantern-05    | lantern-dish, lantern-premium   | lantern-dish (4), lantern-signature-a (3), lantern-signature-b (2), lantern-premium (2)                             |
| lantern-06    | lantern-dish, lantern-premium   | lantern-dish (4), lantern-signature-a (3), lantern-signature-b (2), lantern-premium (2)                             |
| lantern-07    | lantern-dish, lantern-premium   | lantern-dish (4), lantern-signature-a (3), lantern-signature-b (2), lantern-premium (2)                             |
| lantern-08    | lantern-dish, lantern-premium   | lantern-dish (4), lantern-signature-a (3), lantern-signature-b (2), lantern-premium (2)                             |
| lantern-09    | lantern-dish, lantern-premium   | lantern-dish (4), lantern-signature-a (3), lantern-signature-b (2), lantern-premium (2)                             |
| lantern-10    | lantern-dish, lantern-premium   | lantern-dish (4), lantern-signature-a (3), lantern-signature-b (2), lantern-premium (2), lantern-signature-c (1)    |
| orbit-01      | orbit-dish                      | orbit-dish (4)                                                                                                      |
| orbit-02      | orbit-dish                      | orbit-dish (4), orbit-signature-a (3)                                                                               |
| orbit-03      | orbit-dish                      | orbit-dish (4), orbit-signature-a (3), orbit-signature-b (2)                                                        |
| orbit-04      | orbit-dish                      | orbit-dish (4), orbit-signature-a (3), orbit-signature-b (2)                                                        |
| orbit-05      | orbit-dish, orbit-premium       | orbit-dish (4), orbit-signature-a (3), orbit-signature-b (2), orbit-premium (2)                                     |
| orbit-06      | orbit-dish, orbit-premium       | orbit-dish (4), orbit-signature-a (3), orbit-signature-b (2), orbit-premium (2)                                     |
| orbit-07      | orbit-dish, orbit-premium       | orbit-dish (4), orbit-signature-a (3), orbit-signature-b (2), orbit-premium (2)                                     |
| orbit-08      | orbit-dish, orbit-premium       | orbit-dish (4), orbit-signature-a (3), orbit-signature-b (2), orbit-premium (2)                                     |
| orbit-09      | orbit-dish, orbit-premium       | orbit-dish (4), orbit-signature-a (3), orbit-signature-b (2), orbit-premium (2)                                     |
| orbit-10      | orbit-dish, orbit-premium       | orbit-dish (4), orbit-signature-a (3), orbit-signature-b (2), orbit-premium (2), orbit-signature-c (1)              |

## Verification scope and outstanding work

All 25 dishes have intent-driven cooking/serving coverage. All 50 authored levels have winning simulations for teams of 1/2/3/4, including washing/reuse and item conservation. These are automated drivers, not human playtest averages or proof that every random sequence has ideal balance. Regression results and browser verification are recorded in PROGRESS.md.

Remaining: human mobile playtest, broader order-seed difficulty sampling, more distinctive regional recipe silhouettes, and real-device performance/readability acceptance. Existing level briefs and pressure curves are largely retained; this pass does not claim fifty newly redesigned layouts.

## Mobile ingredient row follow-up (2026-10-11)

Newly introduced dispenser stations use a shared front row at `z=7`, spaced across `x=2/6/10`. Their full labels stay tappable on mobile even while far from the chef, and touch picking resolves the nearby projected station surface before a decorative mesh. This changes only station presentation/selection: the server remains authoritative for reachability and item ownership. Level ten's book and all three Little Sun new-ingredient dispensers have a production Chromium E2E; this is not an iPhone Safari validation.

## Run and reproduce

Use `npm.cmd run dev` for local development. For production verification:

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run format:check
$env:E2E_PRODUCTION='true'
npm.cmd run test:e2e
```

The production suite starts its own Guest server on loopback port 2570; it does not require PostgreSQL or publish a tunnel. Pass 7 changes both the client and server protocol (`selectRecipe`) and content, so the active Node process must load the build. The trycloudflare launcher now fingerprints the client/server output and restarts its tracked stale process when needed. Restarting a server ends its active rooms; Guest local progress remains stored.

To regenerate the raw simulation evidence:

```powershell
New-Item -ItemType Directory -Force .runtime | Out-Null
$env:CAMPAIGN_REPORT='.runtime/pass7-balance.json'
$env:RECIPE_REPORT='.runtime/pass7-recipes.json'
npx.cmd vitest run tests/campaign.test.ts
```
