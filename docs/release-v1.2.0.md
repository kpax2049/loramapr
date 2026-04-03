# Release v1.2.0 - Session Comparison Workflow

## Summary
- Added a real Session Comparison workflow for repeated coverage tests.
- Added a stronger comparison entry point in Sessions plus a dedicated compare workspace.
- Added decision-oriented compare metrics centered on `Max range`, `Edge RSSI`, and `Edge SNR`.
- Added prominent farthest-point markers on the shared compare map.

## Compare entry and workspace
- Users can now select `2-4` sessions and start comparison directly from the Sessions workflow.
- Compare mode now opens as a dedicated workspace with selected count, `Fit all`, and `Exit compare`.
- The raw sessions list remains available, but is pushed into a secondary `Change compared sessions` section while comparing.

## Comparison outcomes
- The primary comparison metric is now `Max range` from the configured home/base point.
- Each compared session shows `Edge RSSI` and `Edge SNR` at that farthest successful point.
- Session cards also show `Last successful`, `Measurements`, `Total distance`, `Median RSSI`, and `Median SNR`.
- A compact summary strip highlights the session with the greatest max range, best edge RSSI, and best edge SNR.

## Map judgment
- Compare mode keeps the shared multi-session track overlay with stable per-session colors.
- Each session’s farthest successful point is marked clearly on the map for immediate visual judgment.
- The compare legend is layered and positioned so it stays readable above the rest of the map UI.

## Backend/API
- Extended the existing `GET /api/sessions/:id/stats` response with `home`, `farthestPoint`, `lastRangePoint`, median signal values, and `signalSourceUsed`.
- No new analytics endpoint or reporting backend was added.

## Milestone
- `v1.2.0 — Session Comparison as a real decision workflow` is release-complete for the minimum production-usable comparison feature.
