# Changelog

## v0.9.5 - 2026-02-14

### Added
- App name and version are now shown directly in the UI sidebar footer (`LoRaMapr v0.9.5`).

### Changed
- Added consistent pointer/hover polish across actionable controls and tab interactions to make click targets clearer.
- Improved `Fit to Data` behavior to deterministically fit the currently visible dataset (playback window, coverage bins, or points scope).

### Notes
- No breaking changes.

## v0.9.3 - 2026-02-11

### Added
- Theme mode selector with `System / Light / Dark` options in the sidebar controls, plus Zen-mode access in the map status strip.
- Theme documentation and validation checklist in `docs/ui-v0.9.3-theme.md` with captured light/dark screenshots under `docs/assets/`.

### Changed
- Introduced explicit theme tokens for status strip and coverage legend surfaces/text/borders.
- Improved Leaflet UI readability (zoom controls, attribution, popups, tooltips) using theme-scoped CSS overrides without changing tile style.
- Repositioned sidebar header controls to avoid clipping in collapsed mode and reduce header overlap.

### Notes
- No breaking changes.

## v0.9.2 - 2026-02-11

### Added
- Collapsible, resizable left sidebar with persisted layout state.
- Tabbed sidebar navigation (Device / Sessions / Playback / Coverage / Debug).
- Zen map mode to maximize map area.
- Always-visible compact status strip overlay on the map.

### Changed
- Sidebar layout is viewport-height safe with fixed header/footer and scrollable body.
- Debug tooling moved into a dedicated Debug tab and lazy-mounted to reduce clutter and improve performance.
- Controls are context-sensitive (playback/coverage/explore) to reduce vertical bloat.

### Developer
- UI acceptance checklist and screenshot capture flow added under docs.

### Notes
- No breaking changes.

## v0.9.1 - 2026-02-11

### Highlights
- Agent now pulls per-device auto-session config from backend via the INGEST-scoped endpoint.
- Stale GPS handling added to prevent start/stop flapping in agent decisions.
- Start/stop session endpoints remain idempotent and consistent under repeated calls.
- Agent decision audit trail is stored server-side and surfaced in UI status as last decision.

### Notes
- No breaking changes.

## v0.9.0 - 2026-02-10

### Highlights
- Home session agent for hands-free session capture with geofence transitions and idempotent start/stop.
- Auto-session device config (home lat/lon, radius, inside/outside timers) with GET/PUT API and UI editing (QUERY key protected).
- Geo utilities for Haversine distance + geofence checks, plus latest-position lookup for agents.
- Ops docs for running the agent as a service (systemd example + env config).

### Notes
- No breaking changes.

## v0.8.6 - 2026-02-08

### Highlights
- Meshtastic parity for receiver filtering: receiver list from /api/receivers (QUERY key), receiverId filters for points/tracks, and a compare overlay for two receivers (sampled when needed).
- Meshtastic receiver stats surfaced in the UI (dev-only) and receiver list responses normalized in the frontend.
- Backend Meshtastic ingest normalization (receiverId from gatewayId), receivers aggregation endpoint, and receiverId support on measurements/tracks.
- README updates for Meshtastic ingest/debug and playback notes.

### Notes
- No regressions to LoRaWAN gateway filtering.

## v0.8.5 - 2026-02-07

### Highlights
- Meshtastic ingest endpoint (POST /api/meshtastic/event) creating webhook events.
- Meshtastic processing pipeline and debug endpoints for listing and detail lookup.
- Frontend Meshtastic events panel with status/errors and GPS field detection.
- Device latest status now surfaces last ingest source (lorawan/meshtastic).

### Notes
- Meshtastic debug endpoints require an X-API-Key with QUERY scope.

## v0.8.1 - 2026-02-07

### Highlights
- Playback performance polish: responsive UI on large sessions with adaptive sampling.
- Sampling visibility: “Sampled X of Y points” surfaced in playback.
- Overview track behind the window track; click-to-jump cursor on the overview.
- Keyboard shortcuts for playback (space, arrows, shift+arrows, home/end).
- Empty-window behavior stabilized (last-good items retained; no flicker/clearing).

### Notes
- No breaking changes.

## v0.8.0 - 2026-02-06

### Highlights
- Session playback mode with scrubber, play/pause, speed control, and configurable time window.
- Deterministic replay via URL-synced playback state (shareable/reproducible debugging).
- Session timeline metadata endpoint and windowed session slice endpoint.
- Playback map view renders only the active time window plus an interpolated cursor marker.
- Explore mode time filtering now supports presets (Last 15m/1h/6h/24h/All) with optional advanced custom range.

### Developer/Testing
- Added e2e coverage for session timeline and window endpoints.
- Prefetching during playback to reduce latency and keep UI responsive.

### Notes
- Playback currently operates on session data (sessionId scope). Bounding-box filtering is disabled to preserve deterministic replay.

## v0.6.0 - 2026-02-04

### Highlights
- Gateway analysis via QUERY-key endpoints: gateway list + stats.
- Gateway filtering uses rxGatewayId (RxMetadata presence) for points and tracks.
- Optional compare gateway overlay for side-by-side point analysis.

### Notes
- Normal points mode remains available without QUERY key (gateway analysis requires it).

## v0.5.0 - 2026-02-04

### Highlights
- Session GeoJSON export via QUERY-key download flow.
- Coverage layer mode with metric selector + legend (bins from /api/coverage/bins).
- Zoom-based sampling for measurements and tracks to reduce DOM load while keeping limit caps.

### Notes
- Includes the retroactive v0.4.0 and v0.4.1 releases.
- No breaking changes.

## v0.4.1 - 2026-02-04 (retroactive)

### Highlights
- Adaptive sampling parameters for measurements/tracks based on zoom level.
- Query keys updated to include sampling for deterministic refetches.

### Notes
- Retroactive tag created on 2026-02-04.

## v0.4.0 - 2026-02-04 (retroactive)

### Highlights
- Coverage bins API surfaced in the frontend with a new coverage layer mode.
- Coverage bins rendering with bucketed styling and simple intensity scaling.

### Notes
- Retroactive tag created on 2026-02-04.

## v0.3.0 - 2026-02-03

### Highlights
- Async LoRaWAN ingest pipeline with idempotent webhook event storage, worker processing, and rate limiting.
- Ops visibility in the UI: LoRaWAN events table with drilldown, summary stats, and reprocess actions.
- Device + map UX upgrades: latest status polling, device UID copy, gateway filters, and fit-to-data behavior.
- Dev tooling/docs for live testing (payload formatter guide, fixtures, and webhook setup docs).

### Notes
- LoRaWAN debug endpoints require an X-API-Key with QUERY scope.
- No breaking changes.

## v0.2.0 - 2026-02-01

### Highlights
- Session-based filtering with a sessions panel (start/stop/select) and URL query sync for filters.
- Map performance/UX upgrades: canvas rendering, zoom-based track simplification, RSSI bucket coloring, and hover tooltips.
- Safer data fetching: abortable requests and zoom-aware result limiting with a “result limited” banner.

### Notes
- No breaking changes.

## v0.1.0 - 2026-01-31

### Highlights
- Vite + React + TypeScript frontend with Leaflet map, controls, and point details panel.
- TanStack Query data fetching with measurements + track overlays and bbox-driven querying.
- Backend API integration, dev proxy setup, and CORS for local dev.
- One-command dev workflow and simulator walkthrough documented.

### Notes
- No breaking changes (first release).
- Known limitations: no routing/auth yet, no clustering.
