# Guest audio refresh — 2026-10-12

## Chill soundtrack replacement

The initial score felt too dramatic for relaxed co-op cooking. The runtime now uses a quiet ambient loop on the menu and a mellow, loopable low-fi track in every restaurant. Both tracks are MP3 for broad iOS/Safari compatibility. Restaurant changes no longer trigger five different musical moods. Playback still starts only after player input, keeps one decoded music buffer, respects volume/mute/tab controls and crossfades between menu and gameplay. The synthesized fallback is slower, quieter and more sparse. Action SFX are unchanged.

The two active files are `menu-calm-loop.mp3` and `kitchen-chill-loop.mp3`; CC0/public-domain source and requested credit are recorded in `apps/client/public/assets/audio/music/SOURCES.md`. The earlier six OGG files remain unused in the folder to avoid deleting assets as part of this change.

The files were downloaded and the local build checks their packaging, but they were not auditioned through an iPhone/Safari device during this turn. Please listen to the new build on your phone and tell me if the overall mood and volume feel right; this change addresses the dramatic tone, not a professional mix/master pass.

## Previous sound refresh

The menu and five kitchens now have separate, recorded loop tracks from OpenGameArt pages that mark the music CC0. A source/author list ships beside the files in `apps/client/public/assets/audio/music/SOURCES.md`.

| Scene                | Track                   | Character                       |
| -------------------- | ----------------------- | ------------------------------- |
| Menu                 | Upbeat Title Theme Loop | Brighter, welcoming opening     |
| Little Sun Diner     | Swinging Sweet          | Light swing for the retro diner |
| Tide Sushi House     | Winter Dust             | Softer, calmer pace             |
| Olive Garden Kitchen | A Brand New Wisdom      | Gentle, warm background         |
| Lantern Wok          | Just Saying Tho         | More rhythmic market feel       |
| Orbit Kitchen        | Flowerbed Fields [Loop] | Bouncy, playful electronic feel |

The six OGG files total about 3.8 MB compressed (3.65 MiB). They are fetched only after the first user interaction and one decoded background buffer is kept at a time to limit mobile memory use. Scene changes crossfade the prior track. If decoding or loading fails, the game uses its original synthesized harmony/melody fallback. Master, Music, SFX, Mute, tab-visibility silence and the existing first-gesture audio unlock are retained.

SFX now include short, distinct note phrases for chopping completion, mixing, ready-to-serve cues, co-op handoff, warnings, burned food, customers leaving, and match results. Repeated chopping/washing/continuous-action cues are throttled, while recorded pickup, placement, chopping, frying, washing and service sounds remain in use with restrained playback variation. The existing cat meow/purr cues are unchanged.

The built-in motif fallback now layers a simple lead, bass notes and venue-specific chords instead of emitting one isolated triangle-wave note. This is only a compatibility fallback; the downloaded loop tracks provide the main menu and restaurant music.

## Limits

- No professional composer or recording session was commissioned. The selected CC0 tracks are temporary soundtrack choices and need a human listening pass for tone, volume balance and loop seams.
- This machine cannot confirm the result through Safari on an iPhone. In particular, embedded browsers may differ in OGG decode support; the fallback should still play if a track fails, but device confirmation remains outstanding.
- This refresh does not change simulation, gameplay timing, multiplayer events, recipes, or database/account behavior.
