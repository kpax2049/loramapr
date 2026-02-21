# Ingestion

## 1) Sources

### LoRaWAN (TTS)

- External webhook source (The Things Stack) posts uplinks to:
  - `POST /api/lorawan/uplink`
- Backend stores incoming payloads as `WebhookEvent` (`source: 'lorawan'`) and processes them in `LorawanService` worker.

### Meshtastic (Pi Forwarder)

- Pi Forwarder posts events to:
  - `POST /api/meshtastic/event`
- Backend stores payloads as `WebhookEvent` (`source: 'meshtastic'`) and processes them in `LorawanService` worker.
- Forwarder should send full packet JSON as received (plus `_forwarder` metadata). Do not pre-normalize GPS fields in the forwarder.
- Worker promotion rules for common Meshtastic app ports:
  - `NODEINFO_APP` + `decoded.user`: updates `Device` metadata (no `Measurement` row created).
  - `TELEMETRY_APP` + `decoded.telemetry.deviceMetrics`: inserts `DeviceTelemetrySample` (no `Measurement` row created).

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
  - top-level and nested candidates including:
    - `decoded.position.latitude/longitude`
    - `decoded.position.latitudeI/longitudeI`
    - `position.latitude/longitude`
    - `payload.position.latitude/longitude`
    - top-level `lat/lon` and `latitude/longitude`
- Missing GPS (and no node-info fields) => `processingError: 'missing_gps'`.

### Meshtastic non-position promotions

`NODEINFO_APP`:

- Detects packets where `decoded.portnum == 'NODEINFO_APP'` and `decoded.user` exists.
- Resolves device identity from `fromId`/`decoded.user.id`/`from` (best effort).
- Upserts `Device` metadata fields when present (for example `hwModel`, `longName`, `shortName`, `macaddr`, `publicKey`, `isUnmessagable`), sets `lastNodeInfoAt` and `lastSeenAt`.
- Marks `WebhookEvent` processed and clears `processingError`.
- Does not create `Measurement` rows for node-info packets.

`TELEMETRY_APP`:

- Detects packets where `decoded.portnum == 'TELEMETRY_APP'` and `decoded.telemetry.deviceMetrics` exists.
- Inserts `DeviceTelemetrySample` from telemetry metrics:
  - `batteryLevel`, `voltage`, `channelUtilization`, `airUtilTx`, `uptimeSeconds`
  - `raw` stores the `decoded.telemetry` subtree for debugging.
- `capturedAt` precedence:
  - `decoded.telemetry.time` (seconds), else `rxTime`, else event `receivedAt`.
- Updates `Device.lastSeenAt`, marks `WebhookEvent` processed, and clears `processingError`.
- Does not create `Measurement` rows for telemetry packets.

### Coordinate scaling (`lat_i` / `lon_i` style values)

Meshtastic coordinates are passed through `normalizeCoordinate(value, limit)`:

- If value is out of normal range (`abs > 90/180`) or looks like scaled int (`abs >= 1_000_000`), divide by `1e7`.
- This is how integer-like coordinates (for example `latitude_i`/`longitude_i` magnitude) are converted to decimal lat/lon.

Important:

- Many Meshtastic packets are non-position telemetry/node-info packets. These can be valid raw events but still normalize with `missing_gps`.
- If many events show `deviceUid: "unknown"` with `missing_gps`, inspect event detail payload for bridge-side serialization errors (for example `bridgeError` fields).

### GPS quality fields (Measurement)

When position data exists, the worker also stores optional GPS quality/context fields on `Measurement`:

- `alt` / `altitude`
- `hdop`, `pdop`
- `satsInView`, `precisionBits`
- `locationSource`
- `groundSpeed`, `groundTrack`

PDOP scaling rule (Meshtastic):

- `pdopRaw = position.PDOP ?? position.pdop`
- if `pdopRaw > 50`, treat it as centi-PDOP and store `pdopRaw / 100`
- otherwise store `pdopRaw` as-is

### Radio metadata destination

- Canonical summary fields on `Measurement`:
  - `gatewayId`, `rssi`, `snr` (plus optional `sf`, `bw`, `freq` for LoRaWAN).
- Raw metadata JSON is stored in `Measurement.rxMetadata`.
- `RxMetadata` rows are created from `Measurement.rxMetadata` entries that include:
  - `gateway_ids.gateway_id` (+ optional `rssi`, `snr`).
- In practice:
  - LoRaWAN `rx_metadata` matches this shape and is expanded into `RxMetadata`.
  - Meshtastic metadata is stored on `Measurement.rxMetadata`; row expansion only occurs if entries match the `gateway_ids.gateway_id` shape.

### MeshtasticRx table

For Meshtastic position packets, receive diagnostics are also persisted into `MeshtasticRx` (one row per `Measurement`):

- `rxTime`
- `rxRssi`, `rxSnr`
- `hopLimit`, `hopStart`, `relayNode`
- `transportMechanism`
- `fromId`, `toId`
- `raw` (debug subtree)

Notes:

- Not all packets carry `rxRssi`/`rxSnr`; availability depends on the receiver path and transport metadata present in the packet.
- Rebroadcasted/relayed/bridge-forwarded packets may have partial radio fields.

## 4) Debugging

### UI location

- Open **Debug** tab in frontend.
- Panels:
  - Events (Raw Events Explorer)
  - LoRaWAN Events
  - Meshtastic Events

### Raw Events Explorer (unified events)

Use the **Events** panel in Debug when you need to inspect raw ingest traffic across sources in one place.

- What it shows per row:
  - `Time`, `Source`, `Device`, `Portnum`, `rxRssi`, `rxSnr`, and a short summary.
- Filters:
  - `Source` dropdown (`lorawan`, `meshtastic`, `agent`, `sim`)
  - `Device` (`deviceUid`; dropdown suggestions + free text exact match)
  - `Portnum` (result-derived options + free text exact match, for example `POSITION_APP`)
  - Time range (`15m`, `1h`, `24h`, `custom`)
  - `q` text search (matches packet id and indexed payload text)
- Row click opens the event detail drawer with extracted highlights plus full raw `payloadJson`.
- Raw packets remain available in Events Explorer even when they are promoted to `Device` metadata or `DeviceTelemetrySample`.

Search and filter tips:

- Search by `deviceUid`:
  - Prefer the **Device** filter for exact matching.
  - Use `q` when you only know part of the id.
- Search by packet id:
  - Use `q` with the packet/uplink id value (for example `321654987` or `packetId:321654987`).
- Search by Meshtastic node identity fields:
  - Use `q` with `shortName` / `hwModel` values (for example `shortName:ALFA`, `hwModel:RAK4631`, or plain text like `RAK4631`).
  - These are searchable because payload text indexing includes tagged fields from raw packet JSON.

Portnum workflow examples:

- `POSITION_APP`: position packets used for map points and tracks.
- `TELEMETRY_APP`: battery/voltage/device metrics packets.
- `NODEINFO_APP`: node identity/model packets (`longName`, `shortName`, `hwModel`).

Examples:

- Battery telemetry often appears under `TELEMETRY_APP` (for example battery percent/voltage fields in payload).
- Device/node model details commonly appear under `NODEINFO_APP` (for example `hwModel` in payload).

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

Raw Events Explorer:

- `GET /api/events`
- `GET /api/events/:id`

List endpoint pagination and limits:

- `GET /api/lorawan/events`
  - query: `deviceUid`, `processingError`, `processed`, `limit`, `cursor`
  - defaults/max: default `limit=50`, max `limit=5000`
  - cursor: pass prior `nextCursor` to fetch older rows (`receivedAt < cursor`)
  - response: `{ items, count, limit, nextCursor }`
- `GET /api/meshtastic/events`
  - query: `deviceUid`, `processingError`, `processed`, `limit`, `cursor`
  - defaults/max: default `limit=50`, max `limit=5000`
  - cursor: pass prior `nextCursor` to fetch older rows (`receivedAt < cursor`)
  - response: `{ items, count, limit, nextCursor }`

RxMetadata-derived receiver/gateway lists (QUERY scope):

- `GET /api/gateways`
  - defaults/max: default `limit=500`, max `limit=5000`
  - response: `{ items, count, limit }`
- `GET /api/receivers`
  - defaults/max: default `limit=500`, max `limit=5000`
  - response: `{ items, count, limit }`
- `GET /api/meshtastic/receivers`
  - defaults/max: default `limit=500`, max `limit=5000`
  - response: `{ items, count, limit }`

These debug endpoints require `X-API-Key` with `QUERY` scope (frontend typically via `VITE_QUERY_API_KEY`).

## 5) Raw payload retention note (v0.10.0)

- v0.10.0 stores full raw ingest payloads on `WebhookEvent.payloadJson` for later normalization, debugging, and reprocessing workflows.
- Promotions (`NODEINFO_APP` / `TELEMETRY_APP`) are additive: raw packet payloads are still queryable via Events Explorer and `/api/events/:id`.

## 6) Measurement-to-event linking (`sourceEventId`)

- When an incoming webhook event normalizes into a `Measurement`, the worker writes:
  - `Measurement.sourceEventId = WebhookEvent.id`.
- This creates an exact measurement -> raw event link.
- UI behavior:
  - **View raw packet** first tries exact navigation by `sourceEventId` (`/api/events/:id` detail).
  - If `sourceEventId` is missing (older rows/manual ingest), UI falls back to `deviceUid + capturedAt` time-window search.

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
