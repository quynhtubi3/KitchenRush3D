# A2 — identity and match finalization reliability

Implemented on 2026-10-09. This is the narrowly authorized A2 follow-up to the Astra audit. The live Guest game remains `GUEST_ONLY=true`; Account UI rollout, Economy, Friends and leaderboards remain deferred. No live database or tunnel process was reconfigured.

## Participation

`CoopRoom` freezes distinct persistence identities from connected members when the lobby transitions to play. A lobby visitor who leaves before start is excluded. A chef who participates at start retains eligibility after disconnect, reconnect or explicit departure. Leaving cannot change the frozen list. Solo continues to use its joined identity. Each room submits its authoritative result once; no client result-write endpoint was added. The queue owns retries after submission, independently of the room.

## Merge and transactions

Additive migration `003_identity_merge.sql` adds `player_profile.merged_into`. Migration files 001 and 002 are unchanged. A merged Guest row remains as a reference for active rooms and pending journal entries; its sessions are revoked and its old Guest token cannot mint sessions or upgrade that alias. Authentication never follows an alias to grant account access. Repeating a merge cannot transfer the Guest to another account.

Finalization resolves the original participants to canonical identities inside the SQL transaction and deduplicates them, including when the owner and Guest were both in the same match. Completed history/progress/imports are transferred during merge, with overlapping match wins counted once. An import already in flight also resolves the canonical identity under the same lock. The original Guest row survives, so its ID does not break the team's foreign keys.

Merge, registration, legacy archival and match finalization acquire the same transaction advisory lock before profile locks. This deliberately serializes these writes for the current single-process architecture. It prevents merge/finalization races and inconsistent aggregates; it is not a high-throughput multi-region design. Existing match IDs and the atomic result/participant/progress transaction provide idempotence. `best()` remains an aggregate, not an authoritative match-history or ranking record.

## Durable retry

When accounts are configured, the server starts one `MatchQueue`. `MATCH_OUTBOX_DIR` selects its directory; default is `.runtime/match-outbox` relative to the server working directory. Guest-only mode creates no queue, opens no database pool and writes no journal.

- A job contains a copy of the server result and frozen participant IDs, never credentials.
- The worker writes and fsyncs a temporary JSON file, then atomically renames it before calling SQL. Match IDs are hashed for safe filenames.
- Failed writes retry at 1, 2, 4, 8, 16, 32, then 60 seconds maximum between attempts. One worker performs finalization; room ticks do not issue SQL retries.
- The journal is removed only after successful SQL commit. If commit succeeded but acknowledgement/cleanup failed, redelivery is safe because SQL is idempotent.
- Startup replays remaining journal files. Orderly shutdown journals any pending in-memory submissions. Malformed files remain on disk and are logged for operator inspection.
- PostgreSQL statement/lock timeouts are 10/5 seconds, with a 3-second connection timeout. Idle pool connection errors no longer terminate the game server during an outage.

The directory must be writable and persistent, specific to the same database/environment, and owned by only one server process. Mount it on a persistent volume before enabling accounts in a container. Monitor pending files and `Match persistence pending` logs; do not delete a journal to silence an error. Permanent schema/identity errors require operator repair. No retry silently drops a result after a fixed attempt limit.

Limits: a hard crash before the first successful journal write can still lose an in-memory result; disk failure/full disk cannot provide durability. Unfinished rooms remain in memory and do not survive a server restart. File fsync/rename is not a guarantee against every storage/power failure. Multiple workers sharing one directory, disaster recovery, load testing and a hosted production database are not verified.

## Isolated PostgreSQL verification

This workspace had no PostgreSQL/Docker runtime. A portable PostgreSQL 17.11 archive from [EDB's binary distribution](https://www.enterprisedb.com/download-postgresql-binaries) was extracted under ignored `.tools/postgresql-a2`. An isolated cluster under `.runtime/a2-postgres-data` listens only on loopback port 55432, with database `kitchen_a2_test`. No existing database was used. It has disposable local trust authentication and must not be exposed as a service to other machines. The temporary server was stopped after verification; the data directory remains for another local run.

Migration 001→002→003 and the 50-level/10-recipe seed ran against that test database. Reproduce against an isolated migrated PostgreSQL database whose name contains `_test`:

```powershell
$env:DATABASE_URL='postgres://postgres@127.0.0.1:55432/kitchen_a2_test'
& '.\\.tools\\postgresql-a2\\pgsql\\bin\\pg_ctl.exe' -D '.runtime\\a2-postgres-data' -l '.runtime\\a2-postgres.log' -o '"-h 127.0.0.1 -p 55432"' -w start
npm.cmd run db:migrate
npm.cmd run db:seed
$env:ACCOUNT_TEST_DATABASE_URL=$env:DATABASE_URL
npm.cmd run test:db
```

Eight database tests passed, including a migration upgrade against populated 4.1 schema and a real authenticated Colyseus room with merge during play, reconnect, early lobby departure, departure after start and result persistence after room disposal. The persistence fixture accelerates the authoritative server clock/targets to finish the match; it is not a cooking E2E. A TCP proxy severs real PostgreSQL connections to verify outage/recovery without stopping another database. The queue is then recreated from disk, including a failure after successful SQL commit. Registration, session revocation, repeated/concurrent merge/finalization and two-device progress agreement are checked with real SQL.

Additional queue tests cover immutable jobs, backoff, disk-write failure/recovery, malformed records and orderly shutdown. A separate real Colyseus integration test observes the frozen cohort and single submission without a database. Build/typecheck, 357 unit/regression tests (9 database setup cases skipped), format check, one account browser E2E and five Guest browser E2Es passed. This is a targeted regression set, not the complete campaign/visual E2E suite. Results are recorded in [PROGRESS.md](PROGRESS.md).

## Migration deployment and rollback

This change does not authorize enabling Accounts on the live Guest service. For a future account-enabled deployment, first back up the database and test restoring it, preserve the outbox directory, stop account writes/rooms, apply the additive migration, and deploy the matching server code before resuming. Do not mix an old server that deletes Guests with the new alias design.

Before any merges exist, rollback can stop the new writer, drain/preserve its journal, verify `SELECT count(*) FROM player_profile WHERE merged_into IS NOT NULL` is zero, then remove the new column/index/check and its migration ledger entry in a transaction while reverting server code. Once merges have occurred, dropping the column loses the destination mapping: keep migration 003 and repair forward, or restore a consistent database/outbox backup. No destructive rollback has been executed here.
