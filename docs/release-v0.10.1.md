# Release v0.10.1 - Meshtastic device metadata + telemetry UX

## Added
- Added Meshtastic device identity enrichment in backend device payloads from `NODEINFO_APP` packets, including:
  - `meshtasticNodeId`
  - `longName` / `shortName`
  - `hwModel`
  - `role`
  - `macaddr`
  - `publicKey`
  - `isUnmessagable`
  - `lastNodeInfoAt`
- Added persistent telemetry sampling model (`DeviceTelemetrySample`) promoted from Meshtastic `TELEMETRY_APP` packets.
- Added `GET /api/devices/:id/telemetry` endpoint with bounded `limit` support for compact device-level telemetry history.
- Added Device Details Meshtastic + Latest telemetry sections with direct raw-event pivots:
  - `View raw nodeinfo event`
  - `View raw telemetry event`
- Added lightweight SVG sparkline for battery/voltage trend in Device Details (hidden when telemetry is unavailable).

## Changed
- Device picker labels are now compact and no longer include device type/model text, improving readability in constrained sidebar widths.
- Pi-forwarder and ingestion docs were updated to document stdin bridge behavior and NODEINFO/TELEMETRY promotion expectations.

## Milestone
- Operator-level device health/identity debugging is now possible directly from Device Details without immediate fallback to raw logs.

## Acceptance
- Device details expose Meshtastic identity fields and latest telemetry when present.
- Telemetry history endpoint returns bounded samples and powers UI sparkline rendering.
- Raw event links open Events Explorer with prefilled `deviceUid + portnum` filters for nodeinfo/telemetry.
- Device picker remains readable without losing device selection context.
