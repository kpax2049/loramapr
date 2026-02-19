# Release v0.9.17 - Data safety + retention defaults

## Added
- Added a configurable in-process retention worker (`RetentionService`) that schedules periodic cleanup of raw ingest/debug tables.
- Added retention wiki runbook at `docs/wiki/Data-Retention.md` covering defaults, safety boundaries, and operator configuration.
- Added e2e coverage for safe delete semantics (`test/delete-semantics.e2e-spec.ts`) including:
  - session hard delete detaches measurements (`sessionId -> null`) before deleting session,
  - archive mode behavior for session/device,
  - confirmation-header enforcement for hard deletes.

## Changed
- Introduced/standardized retention defaults:
  - `RETENTION_WEBHOOKEVENT_DAYS=30`
  - `RETENTION_AGENTDECISION_DAYS=90`
  - `RETENTION_RUN_AT_STARTUP=false`
  - `RETENTION_SCHEDULE_CRON="0 3 * * *"`
- Added index optimizations for hot query paths:
  - `Measurement`: `(deviceId, capturedAt DESC)`, `(sessionId, capturedAt DESC)`, `(sessionId)`, `(gatewayId)`
  - `WebhookEvent`: `(processedAt)`, `(receivedAt)`, `(source, receivedAt DESC)`, `(deviceUid)`
- Hardened large list/read paths with bounded limits and consistent list response metadata:
  - max limits raised/enforced to `5000` on measurements/tracks/event/debug endpoints,
  - event feeds now support cursor pagination (`cursor`, `nextCursor`),
  - receiver/gateway list endpoints now return explicit `{ items, count, limit }`.

## Data safety model
- Retention deletes only old raw/debug records (`WebhookEvent`, `AgentDecision`) and does not delete canonical measurement/session/device history.
- `WebhookEvent` cleanup is processed-only (`processedAt IS NOT NULL`) so unprocessed/problem rows are retained for diagnostics and replay.
- Session hard delete remains non-destructive for measurements by detaching linked rows rather than cascading measurement deletion.

## Milestone
- App remains performant under growing ingest volume and avoids unbounded raw-event table growth with explicit retention defaults and hot-path index coverage.

## Acceptance
- Raw event/debug storage no longer grows indefinitely under normal operation when retention config is enabled (default schedule daily at 03:00).
- Hot query endpoints (`/api/measurements`, `/api/tracks`, gateway/receiver views, event/debug lists) are protected by hard server-side caps.
- Safe-delete contract is validated in automated tests and reflected in operator-facing wiki docs.
