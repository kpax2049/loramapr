# Playback and Time

## What playback is for

Playback lets you replay a single session over time so you can inspect movement and radio conditions in chronological order.
It is optimized for:

- verifying route progression within one recorded session
- correlating signal changes with location over time
- scrubbing to a specific timestamp and inspecting nearby points

`Explore` mode remains the broader query mode (device/session/time filters over `measurements` + `tracks` + `stats`).

## Scrubber model (time window)

Current implementation in `frontend/src/App.tsx` + `frontend/src/components/PlaybackPanel.tsx`:

1. Select a session.
2. UI loads timeline bounds from `GET /api/sessions/:id/timeline`.
3. Scrubber value is `playbackCursorMs` (milliseconds epoch), clamped to timeline min/max.
4. Window size is `playbackWindowMs` (UI options: 1, 5, 10, 30 minutes).
5. UI requests a centered window:
   - `GET /api/sessions/:id/window?cursor=<ISO>&windowMs=<ms>&limit=<n>&sample=<n>`
6. Backend returns points in `[cursor - windowMs/2, cursor + windowMs/2]`, sorted by `capturedAt`.
7. Map renders window points and a cursor marker interpolated between points.

Playback behavior details:

- Play/pause advances cursor on a timer (`tickMs=250`) using selected speed (`0.25x|0.5x|1x|2x|4x`).
- At session end, playback auto-stops.
- Keyboard controls in playback mode:
  - `Space`: play/pause
  - `ArrowLeft` / `ArrowRight`: step by 1 second x speed (Shift = 10 seconds)
  - `Home` / `End`: jump to min/max

## Sampling and downsampling rules

### Backend sampling

`/api/sessions/:id/window`, `/api/measurements`, and `/api/tracks` all support `sample`.
Sampling uses the same evenly-spaced index selection strategy (keeps first/last point when applicable).

- Session window response includes:
  - `totalBeforeSample`
  - `returnedAfterSample`
- Track response includes:
  - `totalBeforeSample`
  - `returnedAfterSample`

### Playback request shaping (frontend)

Playback dynamically chooses `sample`/`limit` based on zoom and window size:

- zoom `<= 12`: `sample=600`, `limit=2000`
- zoom `<= 14`: `sample=1200`, `limit=3000`
- zoom `> 14`: no `sample`, `limit=5000`
- if window `>= 30 min`: sample is capped to `1000`

### Backend limits and validation

For `GET /api/sessions/:id/window`:

- required: `cursor`, `windowMs`
- `windowMs` allowed range: `1000..3600000`
- default `limit=2000`
- max effective `limit=5000`
- optional `sample` must be positive integer

For `GET /api/measurements` and `GET /api/tracks`:

- default `limit=500`
- max effective `limit=2000`
- optional `sample` must be positive integer

### Map polyline simplification

Track polylines are additionally simplified client-side in `MapView` via `simplify-js` with zoom-based tolerance.
This affects rendering density, not stored/query data.

## Relevant API endpoints and query params

### Playback-specific session endpoints

- `GET /api/sessions/:id/timeline`
  - returns: `sessionId`, `deviceId`, `startedAt`, `endedAt`, `minCapturedAt`, `maxCapturedAt`, `count`

- `GET /api/sessions/:id/window`
  - query:
    - `cursor` (required, ISO timestamp)
    - `windowMs` (required)
    - `limit` (optional)
    - `sample` (optional)
  - returns: `sessionId`, `cursor`, `from`, `to`, `totalBeforeSample`, `returnedAfterSample`, `items[]`

- `GET /api/sessions/:id/overview`
  - query: `sample` (optional)
  - available in backend; not used by current frontend playback UI

### Track endpoint

- `GET /api/tracks`
  - requires exactly one of: `deviceId` or `sessionId`
  - optional query params:
    - `from`, `to`
    - `bbox=minLon,minLat,maxLon,maxLat`
    - `limit`, `sample`
    - `gatewayId`, `receiverId`, `rxGatewayId`
  - note: if both `gatewayId` and `receiverId` are sent, they must match

### Measurement endpoint

- `GET /api/measurements`
  - requires exactly one of: `deviceId` or `sessionId`
  - optional query params:
    - `from`, `to`
    - `bbox=minLon,minLat,maxLon,maxLat`
    - `limit`, `sample`
    - `gatewayId`, `receiverId`, `rxGatewayId`
  - note: if both `gatewayId` and `receiverId` are sent, they must match

### Stats endpoint

- `GET /api/stats`
  - requires exactly one of: `deviceId` or `sessionId`
  - optional query params:
    - `from`, `to`
  - returns: `count`, `minCapturedAt`, `maxCapturedAt`, `gatewayCount`

## Troubleshooting playback/time map behavior

### Map does not recenter after you pan/zoom

Expected behavior.
After user interaction, auto-fit is intentionally disabled (`userInteractedWithMap=true`) so the app does not fight manual navigation.
Use **Fit to data** to recenter.

### Map appears stale after switching device/session

The previous scope-clipping issue is addressed in current code by clearing bbox state on scope changes (`setBbox(null)` + `setDebouncedBbox(null)`) before the next fetch.
If the viewport still looks off, click **Fit to data**.

### Playback window shows no points

If current cursor/window has no points, UI shows `No points in this window`.
Playback also keeps the last non-empty result in memory to reduce flicker while queries refresh.

### Playback seems frozen

Check:

- selected session has timeline points (`minCapturedAt`/`maxCapturedAt`)
- cursor is not already at end (play auto-stops at max)
- speed/window settings are reasonable for point density
