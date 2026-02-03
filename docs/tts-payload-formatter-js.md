# TTS Payload Formatter (JavaScript)

Use this skeleton in The Things Stack uplink payload formatter. It must return decoded payload data with GPS keys so the backend can ingest measurements.

```js
function decodeUplink(input) {
  // TODO: parse input.bytes depending on what the device sends
  // Return data with GPS keys matching docs/device-payload-format.md
  return { data: { lat: 0, lon: 0, alt: undefined, hdop: undefined } };
}
```

Notes:
- The decoded payload must output lat/lon for the backend to ingest.
- Keep returned keys as lat/lon (preferred).
- Leave parsing as TODO until the device payload format is known.
