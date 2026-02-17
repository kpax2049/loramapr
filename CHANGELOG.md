# Changelog

## v0.9.12 - 2026-02-17

### Title
- Guided Onboarding Tour

### Added
- Header `?` help popover is now the single tour entry point and includes `Start tour`, `Reset tour`, and an inline keyboard shortcuts panel.
- Tour step metadata was expanded into sectioned coverage across tabs, selected device header, device controls, sessions, playback, coverage, stats/right panel, shortcuts, and optional debug areas.
- Added broad `data-tour` anchors so steps target stable UI containers and controls consistently across app states.

### Changed
- Tour now auto-switches sidebar tabs for tab-scoped steps, auto-opens/closes the help popover for shortcuts steps, and temporarily expands/collapses the right panel for stats steps while restoring prior state afterward.
- Step filtering now skips gracefully when targets are missing or not visible, reducing broken transitions in conditional UI.
- Tour popover layout was tightened so section jumping and progress text remain readable across widths.

### Acceptance
- Tour covers: tabs, selected device header, device picker, sessions picker, start/stop session, playback, coverage, right panel, shortcuts (Z).
- Starting tour from `?` works and no bottom sidebar tour launch button remains.
- Tour auto-switches tabs for drill-down steps.
- Steps skip gracefully when features are absent.
- Works in light/dark themes and does not break Leaflet interactions.

### Notes
- No breaking API changes.

## v0.9.11 - 2026-02-17

### Title
- Custom Device Markers (Leaflet DivIcon)

### Added
- Custom latest-location map markers now render via Leaflet `DivIcon` with registry-based device icon SVG, optional family badge, and online-status overlays.
- New Device-tab toggle (`Show device markers`) with persisted preference to render one latest-location marker per device.
- Multi-device marker rendering now supports marker click-to-select behavior for fast switching from map context.

### Changed
- Selected-device latest marker now uses the same custom `DivIcon` pipeline and popup presentation.
- Device marker rendering is capped to 200 most-recent devices and excludes measurement-level marker fan-out for predictable performance.
- Marker icon refresh is now deterministic across theme changes, icon override changes, and online-status transitions via memoized `DivIcon` caching and marker key invalidation.

### Notes
- No breaking API changes.

## v0.9.10 - 2026-02-17

### Title
- Device Online Status

### Added
- Reusable `DeviceOnlineDot` component with theme-aware status colors for `online`, `recent`, `stale`, `offline`, and `unknown`.
- Device online status indicator surfaced consistently in device list rows, selected-device header, and status strip.
- Dot tooltip now reports measurement and ingest recency, including ingest source.
- Device details panel now includes a `Status` row summarizing measurement/ingest status and last-seen timing.

### Changed
- Online indicator now pulses only while measurement status is `online`, and respects `prefers-reduced-motion`.
- Ingest ring logic now appears when ingest status is more recent than measurement status to highlight ingest-vs-measurement drift.
- Device status thresholds are configurable via `VITE_ONLINE_MS`, `VITE_RECENT_MS`, and `VITE_STALE_MS`.

### Acceptance
- Dot is visible in device list + selected header + status strip.
- Online state pulses (and stops pulsing when not online).
- Tooltip shows both measurement and ingest recency + source.
- Ring appears when ingest is recent but measurement is not.
- Honors `prefers-reduced-motion`.
- Thresholds adjustable via env without rebuild breakage.

### Notes
- No breaking API changes.

## v0.9.9 - 2026-02-16

### Title
- Backup & Restore Tooling

### Added
- Database backup script (`scripts/db/backup.sh`) producing timestamped compressed dumps under `backups/`.
- Database restore script (`scripts/db/restore.sh`) with safe defaults, optional `--drop-first`, and automatic API stop/start handling.
- Safety guardrails for restore: file validation, target DB visibility, and typed confirmations.
- Optional self-host automation: systemd service + timer for daily backups with configurable retention.
- Documentation for dev vs production workflows and post-restore verification (`docs/backup-restore.md`).

### Notes
- No breaking API changes.

## v0.9.8 - 2026-02-16

### Added
- Session list row actions now include archive/unarchive and safe delete entry points from a per-row menu.
- Session delete modal now supports archive-first workflow, measurement count visibility, and typed `DELETE` confirmation before destructive action.

### Changed
- Session lifecycle UX is now safer and clearer: archived sessions are hidden by default with a persisted toggle, and session selection/playback clearing is guarded against stale list race conditions.
- Sessions panel no longer uses a fixed subpanel height and now inherits parent layout height with proper internal scrolling.
- Map dark theme now renders with Fiord Color style while light theme remains OpenStreetMap raster tiles.
- Status Strip wrapping and alignment were adjusted to prevent clipped second-line content and mixed icon/text baseline drift.
- Selected device header identity area now has higher horizontal priority to reduce unnecessary truncation next to badges.

### Acceptance
- Rename persists and reflects across UI.
- Archived sessions hidden by default; toggle shows them.
- Archive/unarchive works.
- Delete requires typed confirmation + confirm header.
- Delete detaches measurements (verify `sessionId` becomes `null`) and does not erase data.
- No regressions to playback/session timeline endpoints.
- Dark OpenStreetMap theme.

### Notes
- No breaking API changes.

## v0.9.7 - 2026-02-15

### Added
- Device icon system now supports auto-resolution with manual overrides, with icons rendered consistently across devices list, selected-device header, map overlays/tooltips, and status strip.

### Changed
- Known devices auto-render deterministic icons from metadata without manual steps.
- Unknown devices now prompt icon selection only when a QUERY key is present, and selected overrides persist across refreshes and views.
- Clearing an icon override correctly reverts the device back to auto icon resolution.

### Notes
- Icon picker controls are hidden when QUERY key access is unavailable (401/403).
- No breaking changes.

## v0.9.6 - 2026-02-15

### Added
- Device management UI with searchable list, archived toggle, and CRUD actions (rename/edit notes, archive/unarchive).
- Selected-device Details section with compact metadata, timestamps, status, latest location snapshot, and `Center on latest`.
- Distinct latest-location marker for the selected device on the map (with popup metadata), plus safer destructive delete flow requiring explicit confirmation + `X-Confirm-Delete: DELETE`.
- Meshtastic node metadata surfaced on devices when available: hardware model (device type), long/short name, firmware/app version, and role.

### Changed
- Devices API now supports `includeArchived` while excluding archived devices by default.
- Device read endpoints now include latest location snapshot fields (`capturedAt`, `lat`, `lon`, optional radio summary).
- Meshtastic worker now handles node-info style packets to keep device metadata current even when no GPS fix is present.

### Notes
- Deleting a device is destructive and intended for rare cleanup; archiving is the normal workflow.
- Meshtastic device-type metadata appears after node-info packets have been ingested.

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
