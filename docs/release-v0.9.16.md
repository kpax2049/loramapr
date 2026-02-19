# Release v0.9.16 - Health/readiness + start ordering

## Added
- Added `GET /healthz` liveness endpoint while keeping existing `GET /health` compatibility.
- Updated readiness contract for `GET /readyz`:
  - returns `200 { "status": "ready" }` when DB is reachable,
  - returns `503 { "status": "not_ready", "error": "..." }` when DB is unavailable.
- Added readiness-focused test coverage in `test/health.e2e-spec.ts` for both healthy and DB-failure paths.
- Added fast stack checks:
  - `make wait-ready` / `./bin/loramapr wait-ready`
  - `make check` / `./bin/loramapr check`

## Changed
- Hardened startup ordering in compose:
  - `postgres` healthchecks (`pg_isready`)
  - API readiness healthchecks (`/readyz`)
  - dependency ordering so API waits for healthy Postgres.
- Added container-safe API startup bootstrap:
  - wait for DB reachability (`scripts/wait-for-db.js`)
  - run `prisma migrate deploy`
  - start Nest (`scripts/docker/api-entrypoint.sh`)
- Removed race-prone startup behavior by moving background worker loops to application bootstrap with DB probes before timers start.
- Updated docs for health/readiness semantics, startup migrations, and not-ready diagnostics.

## Milestone
- No race conditions at startup: `docker compose up` is now reliable with deterministic DB/readiness gating and idempotent migration startup flow.

## Acceptance
- Repeated API container restarts are safe (idempotent migration/start sequence).
- `/healthz` can be used for liveness, `/readyz` for DB-backed readiness.
- Compose startup no longer depends on timing races between DB, migrations, and worker loops.
