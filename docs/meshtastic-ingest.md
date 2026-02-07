# Meshtastic Ingest

This service accepts Meshtastic-style JSON and stores it as a webhook event for asynchronous processing.

**Endpoint**
- `POST /api/meshtastic/event`

**Auth**
- `X-API-Key` with `INGEST` scope

## Supported Sources

### 1) Meshtastic CLI JSON output (example)
```json
{
  "from": "!a1b2c3d4",
  "nodeId": "!a1b2c3d4",
  "packetId": 123456789,
  "position": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "time": 1717861234
  },
  "rssi": -95,
  "snr": 7.2,
  "receiver": "!gw123"
}
```

### 2) Packet logger format (generic example)
If you have a local packet logger, ensure it emits a node identifier + lat/lon. A minimal shape:
```json
{
  "nodeId": "radio-01",
  "latitude": 377749000,
  "longitude": -1224194000,
  "timestamp": 1717861234,
  "rssi": -88,
  "snr": 5.1,
  "via": "gateway-a"
}
```

## Required Fields (MVP)
- **Node identifier**: `from` or `nodeId`
- **Position**: lat/lon from any accepted pattern
- **Time** (optional): `time` or `timestamp` (seconds)

## Accepted Position Patterns
The worker will ingest a measurement if any of these are present:
- `position.latitude` + `position.longitude`
- `payload.position.latitude` + `payload.position.longitude`
- `lat` + `lon`
- `latitude` + `longitude`

## Coordinate Normalization
Meshtastic sometimes reports lat/lon as 1e-7 integers. Heuristic:
- If `abs(lat) > 90` or `abs(lon) > 180`, or values are large integers (millions), they are divided by `1e7`.

## Example curl
```bash
curl -X POST http://localhost:3000/api/meshtastic/event \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_INGEST_API_KEY" \
  -d '{
    "from": "!a1b2c3d4",
    "position": { "latitude": 37.7749, "longitude": -122.4194, "time": 1717861234 },
    "rssi": -95,
    "snr": 7.2,
    "receiver": "!gw123"
  }'
```
