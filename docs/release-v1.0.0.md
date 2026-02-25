# Release v1.0.0 - Self-hosting hardening

## Summary
- Hardened self-host deployment so operators can bring up the full stack with one command and a production compose profile.
- Completed end-to-end operator workflows from ingest through sessions/playback/coverage and raw-event diagnostics.
- Added reliable data-protection operations with documented backup and restore flows for self-hosted environments.

## Highlights

### One-command self-host
- Production-ready compose setup for the app stack, including API, frontend, and supporting services.
- Environment-driven runtime configuration for predictable local and server deployments.

### Ingestion paths
- Stable ingest paths for LoRaWAN and Meshtastic event flows into unified measurement/event handling.
- Debug and observability surfaces to trace ingest recency and failures without tailing logs.

### Sessions, playback, and coverage
- Session lifecycle controls (start/stop/rename/archive/delete safeguards) and session-scoped analysis.
- Playback timeline controls for time-window exploration and deterministic track replay.
- Coverage rendering and legend parity improvements for count/RSSI/SNR analysis.

### Events Explorer
- Filterable raw-events workflow with detail drawer, JSON inspection, and measurement-to-event provenance.
- Pagination/virtualized list behavior for high-volume event streams.

### Backup and restore
- Scripted backup/restore tooling with safety checks and operational docs.
- Restore workflow includes service coordination and post-restore verification guidance.

### Production compose
- Documented production compose usage and configuration baseline for self-host operators.
- Path toward cloud-hostable operation while keeping home-node ingestion compatibility.

## Milestone
- `v1.0.0 — Self-hosting hardening (cloud-hostable by design)` is release-complete: operators can deploy, ingest, analyze, and recover with documented procedures.

## Notes
- No intentional breaking API changes in this release; this marks the hardened `1.0.0` self-host baseline.
