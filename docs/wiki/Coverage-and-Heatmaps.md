# Coverage and Heatmaps

## Current coverage features

Coverage in the current app is grid-bin based, rendered as map rectangles from `CoverageBin` data.
It is not an interpolated "heat cloud" yet.

Implemented UI features:

- Coverage tab controls in sidebar
- Map layer toggle: `Points` vs `Coverage`
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

- In session filter mode, coverage requests use `sessionId`.
- In time/device mode, coverage requests use `deviceId`.
- Frontend passes current map `bbox`.
- Frontend applies `gatewayId` only for LoRaWAN source selection.
- Frontend does not currently set `day`, so backend default is current UTC day.

## Planned (v1.1.0): Coverage Heatmaps from Sessions

Planned, not implemented yet:

- Add session-focused heatmap views for faster "where was coverage strongest/weakest" analysis.
- Keep current bin metrics (`count`, `rssiAvg`, `snrAvg`) and add optional derived views (for example density-focused views) where useful.
- Introduce a heatmap-oriented API shape (concept), e.g. session-first query with metric + resolution controls while keeping `/api/coverage/bins` for raw bins.

Milestone tracking:

- See planned milestones in [`Changelog`](./Changelog.md).
