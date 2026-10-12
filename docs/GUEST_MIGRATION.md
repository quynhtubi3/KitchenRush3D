# Guest-to-account migration policy

## Server Guest identity

When account persistence is enabled, the browser creates a random continuity token and sends it to the server. The database stores only its digest. The resulting Guest profile has its own stable UUID and session cookie. The continuity token is not the auth session and is not accepted as a player ID.

Registering while signed into that Guest upgrades the same profile UUID, changes its identity fields transactionally and revokes old Guest sessions. Logging into an existing account can merge the current server Guest into that account. The Guest alias remains non-authenticating while live rooms or retry-journal entries may still reference its UUID. Duplicate match participation is collapsed by unique match/player keys.

Server-confirmed progress merges by stable level ID: completion is logical OR, best score/stars and best service metrics retain the better aggregate, and wins are recounted from unique authoritative matches. An old Guest token cannot create another session after its identity has been merged.

## Old browser-local progress

The first account prompt offers a checkbox to attach old local progress for archival review. It is unchecked by default. The browser's existing campaign data is not removed, overwritten or treated as verified. If selected, the server stores a bounded/sanitized snapshot in `legacy_progress_import`; it does not grant level unlocks, stars, match wins, currency, items or other rewards. Current server Guest wins remain the source for cloud progression.

The Guest data can be edited in browser storage and has no server match signature, so this conservative policy prevents local edits from becoming trusted cloud results. The interface labels archived data as unverified. Reconciliation/support tools to prove old match history are not part of this phase.

## Conflict and failure handling

An account merge does not overwrite server progress with local data. It preserves authoritative server progress and merges only server Guest aggregates using the rules above. Legacy snapshots are archived separately and idempotently by source-token digest. SQL transactions ensure a failed migration does not partly upgrade the identity. Browser localStorage remains intact after success or failure so the player can still use the local Guest path.

If the database is down, the player can continue as local Guest. The match does not receive a false cloud-save success state. No account token is written to localStorage.
