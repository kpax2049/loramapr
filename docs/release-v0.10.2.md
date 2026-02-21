## v0.10.2 - GPS Quality + Meshtastic RX + Event-to-Point Linking

### Summary
- Added measurement-level GPS quality/context fields across normalization and detail responses.
- Added `MeshtasticRx` persistence for per-measurement receive diagnostics with idempotent upsert.
- Improved Debug/Events and map interoperability with event-to-point selection and stale selection cleanup.

### Added
- New optional `Measurement` fields now populated when available:
  - `altitude`, `hdop`, `pdop`, `satsInView`, `precisionBits`, `locationSource`, `groundSpeed`, `groundTrack`.
- New `MeshtasticRx` model/table (one-to-one with `Measurement`) storing:
  - `rxTime`, `rxRssi`, `rxSnr`, `hopLimit`, `hopStart`, `relayNode`, `transportMechanism`, `fromId`, `toId`, `raw`.
- Point Details now includes:
  - GPS Quality section.
  - Radio (Meshtastic) section.
  - `View raw packet` navigation to Events Explorer with closest-packet targeting.

### Changed
- Events Explorer row selection now attempts best-effort map point highlight using exact event match, then time/device/position matching.
- No-match behavior now clears stale map-point selection instead of leaving outdated Point Details visible.
- Events device filter now syncs with global selected device context to keep map/measurement scope aligned.

### Docs
- Updated `docs/wiki/Data-Model.md` for GPS quality fields and `MeshtasticRx`.
- Updated `docs/wiki/Ingestion.md` for PDOP scaling and Meshtastic RX availability caveats.

### Acceptance
- Measurement detail responses include GPS quality fields and optional `meshtasticRx` when source data exists.
- Selecting debug events highlights a corresponding point when confidence is sufficient; otherwise stale point selection is cleared.
- Docs describe PDOP scaling (`>50` interpreted as centi-PDOP and divided by `100`) and note that `rxRssi`/`rxSnr` are not guaranteed on every packet.

### Notes
- This release is additive and non-breaking.
