# The Things Stack Webhook Setup

## Webhook URL

Use the LoRaMapr uplink endpoint:

```
/api/lorawan/uplink
```

## Request authentication

Choose one of the following:

- **Downlink API key**: set a Downlink API key in TTS, which sends the `X-Downlink-Apikey` header.
- **Request authentication (Basic auth)**: enable basic auth in TTS and set credentials that match
  `TTS_WEBHOOK_BASIC_USER` / `TTS_WEBHOOK_BASIC_PASS` in the backend.

> The backend accepts either the `X-Downlink-Apikey` header or Basic auth. If both are missing or invalid, the request is rejected.

## Event types

Enable **uplink** events for the webhook.

## Recommended field paths

Include these fields in the webhook payload:

- `end_device_ids`
- `received_at`
- `correlation_ids`
- `uplink_message.decoded_payload`
- `uplink_message.rx_metadata`
- `uplink_message.settings`

## Important note

`decoded_payload` must include latitude/longitude fields (for example `lat`/`lon`, `latitude`/`longitude`, or nested under `gps`) so the backend can ingest measurements. This is handled by your payload formatter.
