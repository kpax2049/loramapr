# Coverage and Heatmaps

## Current coverage features

Coverage in the app supports two visualizations from the same `CoverageBin` data:
- **Bins** (rectangle grid)
- **Heatmap** (HeatmapOverlay layer)

Implemented UI features:

- Coverage tab controls in sidebar
- Map layer toggle: `Points` vs `Coverage`
- Coverage visualization toggle: `Bins` vs `Heatmap`
- Coverage scope toggle:
  - `Device` (aggregate all sessions)
  - `Session` (single selected session)
- Coverage tracks toggle: show/hide track polylines while staying in Coverage mode
- Metric selector:
  - `count`
  - `rssiAvg`
  - `snrAvg`
- Color legend with fixed buckets:
  - `count`: `1-5` (low), `6-20` (med), `21+` (high)
  - `rssiAvg`: `<= -110 dBm` (low), `-109 to -90 dBm` (med), `>= -89 dBm` (high)
  - `snrAvg`: `<= -5 dB` (low), `-4 to 5 dB` (med), `>= 6 dB` (high)
- Fit-to-data support for coverage bins

## Data sources and aggregation

Coverage bins are derived from `Measurement` rows and stored in `CoverageBin`.

Aggregation/worker behavior:

- Worker: `CoverageService`
- Default interval: every `10s`
- Controlled by env: `COVERAGE_WORKER_ENABLED` (default enabled)
- Bin size: `0.001` degrees (`binSizeDeg`)
- Bin dimensions:
  - `deviceId`
  - `sessionId` (nullable)
  - `gatewayId` (nullable)
  - `day` (UTC day)
  - `latBin`, `lonBin`
- Stored aggregates:
  - `count`
  - `rssiAvg`, `snrAvg`
  - `rssiMin`, `rssiMax`, `snrMin`, `snrMax`

API used by frontend:

- `GET /api/coverage/bins`
- Query params:
  - required: exactly one of `deviceId` or `sessionId`
  - optional: `day`, `bbox=minLon,minLat,maxLon,maxLat`, `gatewayId`, `limit`
- Response shape:
  - `binSizeDeg`
  - `day`
  - `items`
  - `count`

Current frontend source behavior:

- In Coverage **Session** scope, requests use `sessionId`.
- In Coverage **Device** scope, requests use `deviceId` with all-days aggregation.
- In **Bins** visualization, frontend passes current map `bbox`.
- In **Heatmap** visualization, frontend omits `bbox` for a stable dataset while navigating.
- Frontend applies `gatewayId` only for LoRaWAN source selection.
- Frontend sets `day` when session scope/day context requires it.

## Release tracking

- See `docs/release-v1.1.0.md`.
- See [`Changelog`](./Changelog.md).
