# TTS Application Setup

Use this checklist to wire a The Things Stack (TTS) application to the backend.

## Checklist
- Create application
- Register end devices
  - Find your device identifiers/keys in the device documentation or console:
    - devEUI
    - appKey
    - joinEUI (if required)
- Create webhook integration pointing to:
  - `/api/lorawan/uplink`
- Configure request auth (choose one)
  - Set Downlink API key (sent as `X-Downlink-Apikey`)
  - Enable Request authentication (HTTP Basic)
- Enable uplink events only
- Add recommended field paths to include:
  - `end_device_ids`
  - `received_at`
  - `correlation_ids`
  - `uplink_message.decoded_payload`
  - `uplink_message.rx_metadata`
  - `uplink_message.settings`

## Expected success signals
- `WebhookEvent.processingError` is `null`
- Device `latestMeasurementAt` updates
- Map points appear
