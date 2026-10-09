# Guest Pass 6 — Gameplay UX

Implementation and regression in progress, 2026-10-09. Physical iPhone/Android acceptance is pending.

## Reference and audit

Read the public [phone guide](https://abitsaigon.com/vi/how-to-play-on-phone/), [gameplay guide](https://abitsaigon.com/how-to-play/), [FAQ](https://abitsaigon.com/vi/faq/) and [home page](https://abitsaigon.com/vi/). The `/game` page could not be opened by the browsing tool; no hands-on reference-game play is claimed. Useful principles are visible destinations, low-touch movement, compact order information, clear next actions and optional guidance. No reference source code, models, artwork, sound or distinctive screen composition was imported.

Audit of the existing game: menu provides Guest Solo/co-op and a 50-level selector; lobby already validates ready/host state; order tickets previously opened the recipe book without tracking an individual request; mobile station labels had contextual visibility but no recipe-aware priority; tapping a station sent an immediate interact intent which also queued walking server-side. Portrait reserved joystick space even in tap mode. Results had replay/home but no direct next-level action. Existing four chef colors, inventory roster, server-throttled pings, reconnect and local progress are retained.

## Implemented changes

- Tap is the default. A pure shared pathfinder selects an approach tile, then the server computes the actual route. A pending interaction only emits after a snapshot places the chef at that tile, within 1.05 units, stationary. Item identity changes at the station or in the hand, disconnect, pause, a new move or timeout cancel it. Every request remains server-validated. Duplicate station taps within 300 ms are suppressed, with a short disabled state on the label.
- Settings exposes both arrival interaction (one tap) and explicit second-tap confirmation. Neither option advances more than one cooking action. Chopping still needs the recipe's individual taps; no recipe execution bot is included in production.
- Sixteen reusable ground dots and a destination ring show the authoritative route. They allocate once, stay static under Reduced Motion and never show an invented route before a server update.
- Guidance walks real recipe producer edges, checks assembled components, held inventory, completed/processing stations and teammate work. It chooses a reachable useful branch, can wait for work in progress, and never changes server state. An occupied counter fallback lets players put away incompatible inventory. Tickets select an individual tracked order; each client's selection is independent. Settings can disable guidance.
- A guidance card shows the next station and missing assembly components. The suggested station is highlighted, and moving teammates' station targets get an occupancy dot. Existing four-color/name/inventory roster and bounded pings remain in use.
- Mobile limits full label names to four visible candidates, keeping extra labels as icons with state text. Existing edge markers, collision avoidance, character exclusion and warnings remain. Desktop retains full labels. No warning is removed solely to meet the name budget.
- Portrait tap mode recovers 24 CSS pixels previously reserved for controls. A dismissible portrait-only rotation suggestion does not pause play. Existing landscape framing, portrait follow/overview, safe area, Retina profiles and joystick remain.
- A won Solo match exposes Next level only when local Guest progression actually unlocks it. Replay and co-op room flow remain available; no contribution statistics are fabricated.
- The selector groups the fifty levels by restaurant. Solo and co-op rooms broadcast a three-second preparation countdown, reject gameplay commands during it and do not tick the match clock. The simulation's durations, scoring and recipe balance remain unchanged.

## Verification and evidence

Build/typecheck passed. Unit/integration currently **346 passed, 4 PostgreSQL-dependent skipped**, including real Colyseus countdown synchronization. New tests exercise arrival ordering, duplicate taps, disconnect cancellation, changed shared-station contents, teammate inventory, A/B tap counts and guided completion of a real first dish across all 50 levels. This complements the existing 50-level win simulations, not a claim of human usability or browser wins on every level. Preliminary production browser batch: eight passed (five restaurant cooking tests and three new guidance layouts), before the final countdown/label changes. The full 41-test production run is underway; no full-suite success is claimed yet.

Deterministic first-dish comparison on Little Sun 01: **17 taps** with arrival interaction versus **29 taps** with explicit confirmation. Both run the same simulation and perform one action at a time; the difference is twelve approach confirmations. This is an automated interaction-count comparison, not measured human error or a usability study. Arrival is the provisional default; confirmation stays selectable. Raw result: `screenshots/pass6/interaction-counts.json`.

Archived production captures from the previous pass are copied to `screenshots/pass6/before/` as the historical baseline before the regression overwrites its usual screenshot paths. New captures are written to `screenshots/pass6/` by the gameplay UX browser tests. Full regression output will be recorded after completion.

## Limits and follow-up

Guidance is advisory and not a reservation system: two people can initially choose the same free task; arrival checks and authoritative inventory handling protect the item. It does not compute human error rates or assign roles. A completed dish for a different tracked ticket can be stored on a counter; automatically switching to a matching customer is not implemented.

No physical phone testing is available here. Chromium screenshots and simulation tap counts are proxies, not proof of touch comfort, Safari performance or final UX quality. A four-client test uses one mobile browser plus three real protocol clients, not four rendered phones. Richer restaurant selection, four physical players and real-device playtests remain useful follow-up work; this pass cannot establish final UX acceptance on iPhone/Android.
