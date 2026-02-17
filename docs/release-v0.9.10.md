# Release v0.9.10 - Device Online Status

## Added
- Reusable `DeviceOnlineDot` component with theme-aware status colors for `online`, `recent`, `stale`, `offline`, and `unknown`.
- Device online status indicator shown in Devices list, selected-device header, and status strip.
- Tooltip content for both measurement and ingest recency, including ingest source.
- Device details `Status` row with measurement/ingest state and last-seen timing.

## Changed
- Online pulse animation runs only while measurement state is `online` and is disabled when `prefers-reduced-motion` is enabled.
- Secondary ingest ring appears when ingest is more recent than measurements.
- Status thresholds are configurable via env (`VITE_ONLINE_MS`, `VITE_RECENT_MS`, `VITE_STALE_MS`).

## Acceptance
- Dot is visible in device list + selected header + status strip.
- Online state pulses (and stops pulsing when not online).
- Tooltip shows both measurement and ingest recency + source.
- Ring appears when ingest is recent but measurement is not.
- Honors `prefers-reduced-motion`.
- Thresholds adjustable via env without rebuild breakage.
