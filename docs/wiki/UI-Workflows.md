# UI Workflows

This page documents current user-facing workflows in the self-hosted app UI.

## Sidebar navigation

Main tabs:

- `Device`
- `Sessions`
- `Playback`
- `Coverage`
- `Debug`

The selected device is shared across tabs.

## Device workflow

Use **Device** tab for setup and day-to-day device management:

- pick active device (used by all tabs)
- review/edit device details (name, notes, icon, status metadata)
- center map on latest location
- toggle device markers on map
- configure Home Auto Session (HAS) geofence settings
- manage full device list in **Device Manager** (search/sort/archive/edit/delete)

## Sessions workflow

Use **Sessions** tab for recording and run management:

- switch filter mode:
  - `Time`: broad time-range exploration
  - `Session`: run-by-run analysis
- start/stop sessions for the active device
- select historical sessions for details analysis
- use compare checkboxes to prepare up to `4` sessions for comparison
- open compare mode to analyze repeated runs side-by-side

Session details include run stats, signal charts, lifecycle actions, and map-fit/export actions.

## Playback workflow

Use **Playback** tab for deterministic replay of one session:

- select `Playback` view mode
- choose a session
- play/pause timeline
- scrub to specific timestamps
- adjust window size and replay speed
- inspect map cursor progression through route points over time

For API-level details and sampling behavior, see [[Playback-and-Time|Playback and Time]].

## Coverage workflow

Use **Coverage** tab to evaluate measured reception patterns:

- switch map layer: `Points` or `Coverage`
- in coverage layer:
  - scope: `Device` (all sessions) or `Session` (single run)
  - visualization: `Bins` or `Heatmap`
  - metric: `count`, `rssiAvg`, `snrAvg`
- inspect legend buckets for active metric
- filter/compare gateways or receivers (source-dependent)

For aggregation model and endpoint behavior, see [[Coverage-and-Heatmaps|Coverage and Heatmaps]].

## Debug and events workflow

Use **Debug** tab for ingest troubleshooting and recovery:

- **Events Explorer** (unified events)
  - filter by source/device/portnum/time/text
  - inspect raw event payload details
  - create recovered session from selected events
- live LoRaWAN/Meshtastic event panels
- system status panel (`/api/status`) with request-id visibility

For ingest endpoint and normalization details, see [[Ingestion]].

## Export behavior

GeoJSON export is session-scoped:

- open session details for a selected session
- use **Export GeoJSON**
- backend endpoint: `GET /api/export/session/:sessionId.geojson`
- requires `QUERY` scope key

## Help, shortcuts, and tour

Use the `?` help menu in the sidebar header to:

- start the guided tour
- reset tour completion state
- view keyboard shortcuts (zen mode, sidebar, playback controls)

The guided tour is intended as orientation, not full operator training.

## Key-scope expectations in UI

- most core read flows are available without query key in current self-hosted defaults
- debug/admin/export flows require `QUERY` scope
- ingest clients and automation should use `INGEST` scope outside browser context

See [[API-Keys-and-Scopes|API Keys and Scopes]].
