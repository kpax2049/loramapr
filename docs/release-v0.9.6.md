# Release v0.9.6 - Device Management & Node Metadata

## Added
- Device management UI with searchable device list, archive toggle, and CRUD actions (rename/edit notes, archive/unarchive).
- Selected-device Details section with metadata, timestamps, status, and latest location summary.
- Latest-location support in the Device panel and map:
  - latest known lat/lon (if available)
  - `Center on latest` action
  - distinct marker for selected device latest position
- Safe delete flow:
  - explicit confirmation in UI
  - backend `X-Confirm-Delete: DELETE` requirement
  - archive-by-default, delete-by-exception
- Meshtastic node metadata display (when available):
  - hardware model (device type), long/short name, firmware/app version, role
  - stored on `Device` and surfaced in details and selector/list secondary identity text

## Changed
- Devices API supports `includeArchived` while excluding archived devices by default.
- Device read endpoint returns latest location snapshot (`capturedAt`, `lat`, `lon`, optional radio summary).
- Meshtastic worker processes node-info style packets to update device metadata even without GPS data.

## Notes
- Device deletion is destructive and should be used rarely; archive is the normal path.
- Meshtastic device type appears only after node-info packets have been ingested.
