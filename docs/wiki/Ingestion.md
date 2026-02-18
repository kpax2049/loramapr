# Ingestion

## 1) Sources

### LoRaWAN (TTS)

- External webhook source (The Things Stack) posts uplinks to:
  - `POST /api/lorawan/uplink`
- Backend stores incoming payloads as `WebhookEvent` (`source: 'tts'`) and processes them in `LorawanService` worker.

### Meshtastic (Pi Forwarder)

- Pi Forwarder posts events to:
  - `POST /api/meshtastic/event`
- Backend stores payloads as `WebhookEvent` (`source: 'meshtastic'`) and processes them in `LorawanService` worker.

### Simulator (`simulate:walk`)

- Script command:
  - `npm run simulate:walk -- --apiKey ... --deviceUid ...`
- Script posts measurement batches to:
  - `POST /api/measurements`

## 2) Ingest Endpoints, Headers, Idempotency

### `POST /api/lorawan/uplink`

- Auth guard: `LorawanWebhookGuard` (+ `LorawanRateLimitGuard`).
- Credentials (one of):
  - header `x-downlink-apikey` matching `TTS_WEBHOOK_API_KEY`, or
  - HTTP Basic Auth matching `TTS_WEBHOOK_BASIC_USER` / `TTS_WEBHOOK_BASIC_PASS`.
- No `X-API-Key` scope check on this endpoint.
- Idempotency:
  - `deriveUplinkId(...)` computes `uplinkId` from `correlation_ids` (`as:up:*`) or payload hash fallback.
  - `WebhookEvent.uplinkId` is unique; duplicate inserts are ignored (`P2002` handled as no-op).

### `POST /api/meshtastic/event`

- Required header:
  - `X-API-Key` with `INGEST` scope.
- Optional header:
  - `X-Idempotency-Key` (preferred event id if present and non-empty).
- Idempotency fallback when header missing:
  - `packetId` / `packet_id` / `id`, else `sha256(JSON.stringify(body))`.
- `WebhookEvent.uplinkId` unique constraint prevents duplicate event inserts.

### `POST /api/measurements`

- Required header:
  - `X-API-Key` with `INGEST` scope.
- Body accepts a single measurement object or `{ items: [...] }`.
- Validation enforces one `deviceUid` per request batch.
- No dedicated idempotency key on this endpoint (duplicates are not automatically deduped here).

## 3) Normalization

### GPS detection

LoRaWAN (`normalizeTtsUplinkToMeasurement`):

- Looks in `uplink_message.decoded_payload` or `decoded_payload.gps` for:
  - `lat/lon` or `latitude/longitude`.
- Missing coordinates => event processed with `processingError: 'missing_gps'`.

Meshtastic (`normalizeMeshtasticPayload`):

- Looks in order for:
  - `position.latitude/position.longitude`
  - `payload.position.latitude/payload.position.longitude`
  - top-level `lat/lon`
  - top-level `latitude/longitude`
- Missing GPS (and no node-info fields) => `processingError: 'missing_gps'`.

### Coordinate scaling (`lat_i` / `lon_i` style values)

Meshtastic coordinates are passed through `normalizeCoordinate(value, limit)`:

- If value is out of normal range (`abs > 90/180`) or looks like scaled int (`abs >= 1_000_000`), divide by `1e7`.
- This is how integer-like coordinates (for example `latitude_i`/`longitude_i` magnitude) are converted to decimal lat/lon.

### Radio metadata destination

- Canonical summary fields on `Measurement`:
  - `gatewayId`, `rssi`, `snr` (plus optional `sf`, `bw`, `freq` for LoRaWAN).
- Raw metadata JSON is stored in `Measurement.rxMetadata`.
- `RxMetadata` rows are created from `Measurement.rxMetadata` entries that include:
  - `gateway_ids.gateway_id` (+ optional `rssi`, `snr`).
- In practice:
  - LoRaWAN `rx_metadata` matches this shape and is expanded into `RxMetadata`.
  - Meshtastic metadata is stored on `Measurement.rxMetadata`; row expansion only occurs if entries match the `gateway_ids.gateway_id` shape.

## 4) Debugging

### UI location

- Open **Debug** tab in frontend.
- Panels:
  - LoRaWAN Events
  - Meshtastic Events

### API endpoints behind Debug

LoRaWAN panel:

- `GET /api/lorawan/events`
- `GET /api/lorawan/events/:id`
- `GET /api/lorawan/summary`
- `POST /api/lorawan/events/:id/reprocess`
- `POST /api/lorawan/reprocess`

Meshtastic panel:

- `GET /api/meshtastic/events`
- `GET /api/meshtastic/events/:id`

These debug endpoints require `X-API-Key` with `QUERY` scope (frontend typically via `VITE_QUERY_API_KEY`).

### Common failure modes

- `401 Unauthorized`
  - Cause: missing/invalid credentials.
  - Fix:
    - `/api/meshtastic/event` and `/api/measurements`: provide valid `X-API-Key`.
    - `/api/lorawan/uplink`: provide valid webhook credentials (`x-downlink-apikey` or Basic auth env pair).

- `403 Forbidden`
  - Cause: API key exists but missing required scope.
  - Fix: use key with `INGEST` for ingest endpoints, `QUERY` for debug/read endpoints.

- `400 Bad Request`
  - Typical causes:
    - invalid measurement payload shape (`/api/measurements`)
    - mixed `deviceUid` values in one measurement batch
    - invalid TTS uplink payload schema (`/api/lorawan/uplink`)
  - Fix: validate payload fields and send one-device batches for `/api/measurements`.
