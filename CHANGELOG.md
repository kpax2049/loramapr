# Changelog

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
