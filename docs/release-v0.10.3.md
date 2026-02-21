# Release v0.10.3 - Events Explorer Performance + Provenance

## Summary
- Improved Events Explorer performance for large ingest histories with virtualized row rendering.
- Expanded filtering ergonomics with saved views, quick chips, and persisted filter state.
- Tightened provenance workflows from map points to raw events using exact `sourceEventId` linking first.

## Added
- Virtualized Events rows (React Window) to keep scrolling smooth with thousands of events.
- Saved filter views in local storage for quick context switching across common triage workflows.
- Quick filter chips for source/portnum and summary traits, plus persisted last-used filter state.
- Event detail JSON tools:
  - key/value search,
  - per-node `Copy JSON path`,
  - copy feedback improvements.
- Bottom-of-grid loading mask while fetching additional event pages.

## Changed
- Point Details `View raw packet` now prefers exact navigation by `Measurement.sourceEventId` to `/api/events/:id`.
- Fallback event lookup remains available via device/time-window search when `sourceEventId` is absent.
- Event detail drawer now includes a direct `Copy event id` action for incident sharing and audit trails.

## Docs
- Updated `docs/wiki/Ingestion.md` with portnum filter workflows, `q` search patterns (`deviceUid`, packet id, `shortName`, `hwModel`), and explicit `sourceEventId` linkage behavior.
- Updated `docs/wiki/Troubleshooting.md` with concrete Events Explorer triage patterns and exact-link vs fallback guidance.

## Milestone
- Operators can investigate high-volume ingest streams and trace map points back to raw packets quickly without UI lag or manual payload hunting.

## Notes
- No breaking API changes.
