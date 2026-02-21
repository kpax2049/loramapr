# Release v0.10.0 - Raw Events Explorer + Payload Retention

## Added
- Added a unified raw-events API surface under QUERY scope:
  - `GET /api/events` with filters (`source`, `deviceUid`, `portnum`, `since`, `until`, `q`, `cursor`, `limit`)
  - `GET /api/events/:id` for full event detail retrieval.
- Added persistent raw payload storage for ingest events in `WebhookEvent.payloadJson` so original LoRaWAN/Meshtastic packets remain available for debugging and future normalization passes.
- Added Debug-tab **Events Explorer** UI with:
  - source/device/portnum/time/search filters,
  - cursor-based pagination (`Load more`),
  - row-based detail drawer with extracted highlights (`rxRssi`, `rxSnr`, hops, lat/lon, battery/voltage, hwModel when present),
  - collapsible JSON tree view with copy-to-clipboard and expand/collapse controls.
- Added contextual deep links (`View raw event(s)`) from Device Details and Point Details to open Debug > Events with prefilled URL-backed filters.

## Changed
- Updated Meshtastic + LoRaWAN ingest pipelines to persist richer event metadata (`source`, `portnum`, payload context), aligning raw-event visibility with normalization/reprocess workflows.
- Updated Pi forwarder ingestion robustness (stdin bridge flow, docs, and operational examples) for stable Meshtastic event forwarding in constrained deployments.
- Updated ingestion and troubleshooting wiki docs with concrete Raw Events Explorer triage examples for `TELEMETRY_APP` and `NODEINFO_APP` payloads.

## Milestone
- Operators can inspect ingest health and event-level payloads directly in UI, without relying on backend log tailing for first-pass diagnosis.

## Acceptance
- Raw events are retained in DB for v0.10.0 and queryable via `/api/events` with filter + cursor semantics.
- Debug > Events provides stable list/detail inspection with payload JSON visibility and no forced mode switching.
- Raw-event deep links from device/point context land in Events with relevant filters preselected.
