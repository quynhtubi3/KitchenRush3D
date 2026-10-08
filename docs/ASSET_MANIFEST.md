# Asset manifest

| Asset                                      | Source/path                                 | License/status                                                        |
| ------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------- |
| Chef, hat, apron, customers                | `apps/client/src/game/scene.ts`, `person()` | Original procedural meshes, present                                   |
| Kitchen, counters, grill, sink, bin, seats | same file, `buildKitchen()`                 | Original procedural meshes, present                                   |
| Plates, burger, patty, lettuce, buns       | same file, `food()`                         | Original procedural meshes, present                                   |
| Floor, walls, windows, lamps, plants       | same file                                   | Original procedural meshes, present                                   |
| Action tones                               | `apps/client/src/audio.ts`                  | Original Web Audio synthesis, present                                 |
| Food/trophy UI symbols                     | system emoji/text                           | Platform rendering; no downloaded image asset                         |
| DM Sans, Be Vietnam Pro                    | Google Fonts CSS import                     | SIL Open Font License; optional network font with sans-serif fallback |

No proprietary game assets, copied models or third-party music are used. Procedural geometry is the primary fallback and is always available. Running/waiting/eating use lightweight transform animation; no external animation clips. Full animation set, particles, restaurant music and separated volume channels remain phase 5.

Font references: https://fonts.google.com/specimen/DM+Sans and https://fonts.google.com/specimen/Be+Vietnam+Pro. Font downloads are cosmetic; the game functions with system fonts when blocked.

Phase 3 adds original palette variants and station layouts for five kitchens, catalog-colored ingredient meshes, assembled dishes built from their component meshes, a mixing bowl and a VIP crown. Guest colors identify special types. All are procedural; dedicated restaurant music and detailed equipment/model variations remain phase 5.
