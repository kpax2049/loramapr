# Release v0.10.5 - RC Fixes (blockers)

## Summary
- Fixed Coverage rendering so bin colors now match the active legend palette for each metric.
- Fixed Sessions lifecycle behavior so deleting/archiving the selected session no longer flickers the UI or forces Time mode.
- Fixed Point Details layout so the panel is scrollable and remains viewport-height safe with large payloads.

## Changed
- Coverage buckets now use shared bucket/class mapping consistently across layer rendering and legend labels.
- Session selection/mutation flow now clears selected session safely without mode thrash in Session mode.
- Point Details panel now uses a fixed header + scrollable body pattern to prevent off-screen overflow.

## Quick Manual Test Steps

### 1) Coverage colors match legend
1. Open Coverage mode and load data with visible bins.
2. Switch metric between Count, RSSI avg, and SNR avg.
3. Confirm bin colors on the map match the legend swatches for the selected metric.
4. Pan/zoom and confirm bins remain correctly colored after redraw.

### 2) Session delete/archive does not flicker or force Time mode
1. Open Sessions tab and set filter mode to Session.
2. Select a session, then archive or delete that same selected session from row actions.
3. Confirm selection clears immediately and the UI stays in Session mode.
4. Confirm the list remains visible with a stable empty state (`Select a session`) and no mode flicker.

### 3) Point Details is scrollable and height-safe
1. Open a point/event with large metadata or raw JSON in Point Details.
2. Expand `Raw event JSON` and `All metadata`.
3. Confirm panel content scrolls internally and does not overflow beyond viewport height.
4. Confirm collapse/expand state remains usable and layout stays intact at large desktop resolutions.

## Notes
- No breaking API changes in this release.
