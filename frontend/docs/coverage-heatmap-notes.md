# Coverage Heatmap Notes

## Architecture
- Coverage rendering has two mutually-exclusive paths in `frontend/src/components/MapView.tsx`:
  - `coverageVisualizationMode === 'bins'`: rectangle overlays from `coverageBins`.
  - `coverageVisualizationMode === 'heatmap'`: `CoverageHeatmapLayer` (HeatmapOverlay plugin).
- Heatmap implementation lives in `frontend/src/components/CoverageHeatmapLayer.tsx`.
- Metric-to-heat value mapping is done in `metricToWeight()` in `CoverageHeatmapLayer.tsx`.
- Opacity/theme presentation is applied by `applyHeatStyles()` in `CoverageHeatmapLayer.tsx`.

## Data and update model
- Query data source remains `GET /api/coverage/bins`.
- Heatmap mode requests without bbox (stable dataset during pan/zoom), bins mode remains bbox-driven.
- `overlay.setData()` is driven by bins-data changes only; map zoom/move events do not directly rebuild heat points.
- Downsampling is deterministic in one place (`MAX_POINTS = 6000` + stride) before calling `setData()`.

## Known tradeoffs
- Heatmap uses the official `HeatmapOverlay` plugin with `scaleRadius: true`, so zoom behavior follows plugin internals.
- Private fields are used in one localized place (`applyHeatStyles()` and renderer patch helper) because plugin does not expose public APIs for host element styling and canvas readback patching.
- Session scope uses session-local `max` normalization to keep single-session hotspots readable; device scope uses stable `max = 1` for comparability.

## Test steps
1. Open Coverage tab, switch between **Bins** and **Heatmap**; verify only one visualization appears at a time.
2. In Heatmap mode, pan/zoom the map; verify no delayed bbox refetch flicker and that gradients remain visible.
3. Toggle Coverage **Show tracks** off/on; verify track lines hide/show without changing heat/bins behavior.
4. Switch Coverage scope between **Device** and **Session**:
   - Session scope: hotspots should remain readable.
   - Device scope: intensity should remain stable while navigating.
5. Verify dark/light themes:
   - Heat remains visible in both themes.
   - Track and marker interactions remain unchanged.
