# Changelog

This page tracks tagged releases from `v0.1.0` through the current tag.
For releases with dedicated notes files, those files are linked directly.

## Milestones

- Use your repository milestones/issues board for planned work.
- For release-specific details, start with the entries below and linked docs.

## v0.10.3 (2026-02-21)

- Events Explorer performance release: large event feeds now use virtualized rows with smoother scroll behavior and stable selection during incremental page loads.
- Filtering/provenance UX improvements: saved views, quick chips, persisted filters, and sourceEventId-first raw packet linking from Point Details.
- Event detail JSON inspection now supports search and JSON-path copy for faster payload debugging at scale.
- Release notes: `docs/release-v0.10.3.md`.

## v0.10.2 (2026-02-21)

- GPS quality + Meshtastic RX release: ingestion and measurement detail APIs now include extended GPS quality/context fields and optional per-measurement Meshtastic receive diagnostics.
- Debug/Events to map flow now supports best-effort event-to-point highlighting with stale-selection clearing, plus device-filter sync so Events device selection aligns with main map scope.
- Data model + ingestion docs now explicitly cover PDOP scaling behavior and receiver/transport-dependent availability of `rxRssi`/`rxSnr`.
- Release notes: `docs/release-v0.10.2.md`.

## v0.10.1 (2026-02-21)

- Meshtastic device metadata promotion release: `NODEINFO_APP` packets now populate Device identity fields (`meshtasticNodeId`, names, hw model, role, mac/public key flags).
- Telemetry promotion release: `TELEMETRY_APP` packets persist into `DeviceTelemetrySample` and are exposed via `GET /api/devices/:id/telemetry`.
- Device Details UX now shows Meshtastic identity, latest telemetry, raw-event deep links, and a lightweight telemetry sparkline.
- Device picker labels are compacted (name + UID) to reduce truncation in narrow sidebars.
- Release notes: `docs/release-v0.10.1.md`.

## v0.10.0 (2026-02-20)

- Raw Events Explorer release: added unified QUERY-gated `/api/events` + `/api/events/:id` with source/device/portnum/time/search filters and cursor pagination.
- Full raw ingest payload retention added for LoRaWAN + Meshtastic (`WebhookEvent.payloadJson`) so future normalization/reprocessing can run against preserved originals.
- Debug tab now includes Events Explorer filters, detail drawer highlights/JSON tree, and deep links from device/point context into prefiltered raw events.
- Release notes: `docs/release-v0.10.0.md`.

## v0.9.17 (2026-02-19)

- Data safety + retention defaults release: added configurable backend raw-event retention scheduling with documented defaults (`WebhookEvent` 30d, `AgentDecision` 90d) and daily cron execution.
- Hot-path DB index pass for measurement/event workloads and bounded list-response hardening (`MAX_LIMIT=5000`, cursor pagination on debug event feeds, consistent `limit` metadata on list responses).
- Verified safe delete behavior through e2e coverage to ensure session hard delete detaches measurements and archive remains the default safety path.
- Release notes: `docs/release-v0.9.17.md`.

## v0.9.16 (2026-02-19)

- Health/readiness + startup ordering release: added `/healthz`, standardized `/readyz` readiness contract, and added readiness-path test coverage.
- Compose startup is now healthcheck-gated across dev/prod with DB-first dependency ordering and worker startup deferred until DB-ready application bootstrap.
- API container startup now runs deterministic idempotent bootstrap (`wait-for-db` + `prisma migrate deploy` + server start).
- Added `wait-ready` / `check` commands for fast non-destructive stack verification and updated docs for readiness diagnostics.
- Release notes: `docs/release-v0.9.16.md`.

## v0.9.15 (2026-02-19)

- Prod compose + reverse proxy baseline release: added `docker-compose.prod.yml` for internal-network deployment with reverse-proxy-only public ingress.
- Added Caddy templates (`deploy/Caddyfile.example`, `deploy/Caddyfile`) with local HTTP and domain HTTPS modes plus TLS notes.
- Hardened backend CORS to strict production allowlist behavior via `CORS_ORIGINS`.
- Added production convenience commands (`make/bin` prod-up/down/logs) and deploy smoke-test checklist.
- Release notes: `docs/release-v0.9.15.md`.

## v0.9.14 (2026-02-19)

- One-command bootstrap release: root `Makefile` + `bin/loramapr` now provide `up/down/logs/ps/reset/demo/keys` for consistent local orchestration.
- Added setup secret generation (`scripts/setup/generate-secrets.js` + wrapper) to create `.env` from `.env.example` and fill missing `QUERY_API_KEY` / `INGEST_API_KEY` values.
- Quickstart docs now match the real first-run flow; milestone marker is a clean-clone boot path with env setup plus one command.
- Release notes: `docs/release-v0.9.14.md`.

## v0.9.13 (2026-02-18)

- Documentation Wiki Pack release: full `docs/wiki/` content rollout plus GitHub Wiki-native sidebar/home navigation fixes.
- Automated wiki sync added via `scripts/wiki/sync-wiki.sh` (`--ssh` / `--https`, delete-sync semantics, optional commit message).
- Release notes: `docs/release-v0.9.13.md`.

## v0.9.12 (2026-02-17)

- Guided onboarding tour release: sectioned tour flow across key UI tabs and panels with stable `data-tour` anchors.
- Release notes: `docs/release-v0.9.12.md`.

## v0.9.11 (2026-02-17)

- Custom device markers (Leaflet `DivIcon`) release for richer map identity rendering.

## v0.9.10 (2026-02-17)

- Device online status release (online/recent/stale/offline/unknown) with UI indicator + threshold support.
- Release notes: `docs/release-v0.9.10.md`.

## v0.9.9 (2026-02-16)

- Backup/restore tooling release with guarded restore flow and operational runbooks.
- Release notes: `docs/release-v0.9.9.md`.

## v0.9.8 (2026-02-16)

- Sessions lifecycle release: rename/archive/safe delete workflows and detach-on-delete semantics.
- Release notes: `docs/release-v0.9.8.md`.

## v0.9.7 (2026-02-15)

- Device icons release: auto mapping plus override support.

## v0.9.6 (2026-02-15)

- Device management + node metadata release (archive flow, notes/name edits, latest-location and metadata surfacing).
- Release notes: `docs/release-v0.9.6.md`.

## v0.9.5 (2026-02-14)

- UX polish + version label release.
- Release notes: `docs/release-v0.9.5.md`.

## v0.9.4 (2026-02-13)

- Pi forwarder operations/docs alignment release plus frontend default windowing behavior tuning.

## v0.9.3 (2026-02-11)

- Theme switcher release (light/dark/system behavior and docs checklist updates).

## v0.9.2 (2026-02-11)

- Layout and UX compactness release.

## v0.9.1 (2026-02-11)

- Hands-free sessions release iteration: agent completion and decision audit trail hardening.

## v0.9.0 (2026-02-10)

- Hands-free field session capture release (home-driven geofence start/stop via agent endpoints).

## v0.8.6 (2026-02-08)

- Meshtastic parity + receiver filtering release (gateway-equivalent filtering model for meshtastic receiver views).

## v0.8.5 (2026-02-07)

- Meshtastic ingestion MVP release.

## v0.8.1 (2026-02-07)

- Playback polish release iteration.

## v0.8.0 (2026-02-06)

- Session timeline/window e2e coverage release iteration.

## v0.7.0 (2026-02-05)

- Frontend dev flow documentation release: Docker-backed backend quickstart plus Vite frontend guidance.

## v0.6.0 (2026-02-04)

- Multi-gateway analysis baseline release (`rxGatewayId` filtering and gateway stats acceptance scope).
- Release notes: `docs/release-v0.6.0.md`.

## v0.5.0 (2026-02-04)

- Tagged release checkpoint (`v0.5.0`).

## v0.4.1 (2026-02-04)

- Session GeoJSON export and zoom-aware sampling/query-key updates release (retroactive tag).

## v0.4.0 (2026-02-04)

- Coverage layer mode release: coverage bins rendering, metric selection, and legend/class bucket wiring (retroactive tag).

## v0.3.0 (2026-02-03)

- Tagged release checkpoint (`v0.3.0`).

## v0.2.0 (2026-02-01)

- Tagged release checkpoint (`v0.2.0`).

## v0.1.0 (2026-01-31)

- Initial tagged release baseline (`v0.1.0`).
