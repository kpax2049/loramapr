# Changelog

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
