# Release v1.1.0 - Coverage Heatmaps

## Summary
- Added a Heatmap visualization for coverage, alongside the existing Bins (rectangle grid) view.
- Added Coverage scope controls for Device (all sessions) vs Session analysis.
- Added a Coverage track visibility toggle to declutter map overlays while inspecting coverage layers.

## New: Heatmap coverage view
- Coverage now supports a Heatmap mode in addition to Bins.
- Heatmap gives an at-a-glance view of strongest vs weakest coverage areas.

## Coverage scope: Device vs Session
- **Device (All sessions):** aggregates coverage across all recorded sessions for the selected device.
- **Session:** switches coverage to a single selected session for walk/drive-level inspection.

## Map controls
- Added Coverage visualization toggle: **Bins ↔ Heatmap**.
- Added Coverage tracks toggle: **Show tracks** on/off.

## Metrics
- Heatmap reflects the currently selected coverage metric (same metric options as Coverage), so distribution can be analyzed by count / RSSI avg / SNR avg.

## Milestone
- `v1.1.0 — Coverage Heatmaps from Sessions` is release-complete for frontend UX and controls.
