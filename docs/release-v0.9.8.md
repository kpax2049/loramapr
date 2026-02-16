# Release v0.9.8 - Sessions Lifecycle (Rename, Archive, Safe Delete)

## Added
- Session row actions via kebab menu:
  - Archive (if active)
  - Unarchive (if archived)
  - Delete (danger, guarded)
- Safe delete modal flow:
  - Session identity + measurement count preview
  - Archive-first default action
  - Typed `DELETE` confirmation gate for destructive delete
  - Backend confirm header enforcement (`X-Confirm-Delete: DELETE`)

## Changed
- Session lifecycle UX and data-state behavior:
  - Archived sessions are excluded by default and shown only when `Show archived` is enabled.
  - Selection clearing for session/playback now waits for fresh session-list data to avoid Start Session race/flicker regressions.
- Sessions panel layout:
  - Removed fixed-height legacy cap; panel now inherits parent height and scrolls internally.
- Map theme:
  - Dark map styling now uses Fiord Color; light mode remains OpenStreetMap raster.
- Overlay/header polish:
  - Status Strip no longer clips wrapped content and has normalized icon/text alignment.
  - Selected device identity row has improved horizontal allocation versus badge area.

## Acceptance
- Rename persists and reflects across UI.
- Archived sessions hidden by default; toggle shows them.
- Archive/unarchive works.
- Delete requires typed confirmation + confirm header.
- Delete detaches measurements (verify `sessionId` becomes `null`) and does not erase data.
- No regressions to playback/session timeline endpoints.
- Dark OpenStreetMap theme.

## Notes
- Delete remains intentionally explicit and should be used sparingly; archive is the normal operational path.
