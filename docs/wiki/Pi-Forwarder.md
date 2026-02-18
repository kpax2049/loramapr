# Pi Forwarder

## What it does

`apps/pi-forwarder` is a small Node/TypeScript process that forwards Meshtastic JSON events to backend ingest:

- target endpoint: `POST /api/meshtastic/event`
- auth header: `X-API-Key` (INGEST scope)
- idempotency header: `X-Idempotency-Key` (computed per event)
- adds `_forwarder` metadata (`deviceHint`, `receivedAt`, `eventId`) to payload

## Install / Build / Start

From repo root:

```bash
cd apps/pi-forwarder
npm install
npm run build
npm run start
```

Development mode:

```bash
cd apps/pi-forwarder
npm run dev
```

## Environment variables (`src/env.ts`)

Validated env vars:

- `API_BASE_URL` (required, URL)
- `INGEST_API_KEY` (required)
- `DEVICE_HINT` (optional)
- `SOURCE` (required): `cli` or `stdin`
- `MESHTASTIC_PORT` (optional)
- `MESHTASTIC_HOST` (optional; currently unused in CLI mode)
- `CLI_PATH` (optional, default `meshtastic`)
- `POLL_HEARTBEAT_SECONDS` (optional, default `60`)
- `POST_TIMEOUT_MS` (optional, default `8000`)
- `RETRY_BASE_MS` (optional, default `500`)
- `RETRY_MAX_MS` (optional, default `10000`)
- `MAX_QUEUE` (optional, default `5000`)

Example env:

```bash
API_BASE_URL=http://localhost:3000
INGEST_API_KEY=replace_me
DEVICE_HINT=pi-home-node
SOURCE=cli
MESHTASTIC_PORT=/dev/serial/by-id/usb-Seeed_Tracker_L1_...
MESHTASTIC_HOST=
CLI_PATH=meshtastic
POLL_HEARTBEAT_SECONDS=60
POST_TIMEOUT_MS=8000
RETRY_BASE_MS=500
RETRY_MAX_MS=10000
MAX_QUEUE=5000
```

## `SOURCE=stdin` vs `SOURCE=cli`

### `SOURCE=stdin`

- Reads one JSON object per line from stdin.
- Useful for piping another process:

```bash
meshtastic --listen | API_BASE_URL=http://localhost:3000 INGEST_API_KEY=... SOURCE=stdin node dist/index.js
```

### `SOURCE=cli`

- Spawns Meshtastic CLI (`CLI_PATH --listen` and optional `--port <MESHTASTIC_PORT>`).
- Parses JSON from CLI output (stdout + supported stderr fallback parsing).
- Auto-restarts CLI process on exit with backoff.

Important serial-port warning:

- CLI mode opens the serial device directly.
- Only one process can hold the serial port at a time.
- If another process already owns it (for example another Meshtastic logger), forwarder cannot read from it.

Port lock check:

```bash
lsof /dev/ttyACM0
```

## systemd setup

Provided unit file:

- `apps/pi-forwarder/systemd/loramapr-pi-forwarder.service`

Install:

```bash
sudo cp apps/pi-forwarder/systemd/loramapr-pi-forwarder.service /etc/systemd/system/
sudo mkdir -p /etc/loramapr
sudo tee /etc/loramapr/pi-forwarder.env >/dev/null <<'EOF'
API_BASE_URL=http://localhost:3000
INGEST_API_KEY=replace_me
SOURCE=cli
CLI_PATH=meshtastic
MESHTASTIC_PORT=/dev/serial/by-id/usb-Seeed_Tracker_L1_...
POLL_HEARTBEAT_SECONDS=60
POST_TIMEOUT_MS=8000
RETRY_BASE_MS=500
RETRY_MAX_MS=10000
MAX_QUEUE=5000
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now loramapr-pi-forwarder
```

Logs:

```bash
sudo journalctl -u loramapr-pi-forwarder -f
```

Note: the unit template uses `User=pi` / `Group=pi`; adjust for your host user if needed.

## Smoke test

Direct backend ingest check:

```bash
curl -i -X POST "http://localhost:3000/api/meshtastic/event" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_INGEST_KEY" \
  -H "X-Idempotency-Key: pi-forwarder-smoke-1" \
  -d '{"from":"pi-smoke-node","lat":37.77,"lon":-122.42,"packetId":"pi-smoke-1"}'
```

Expected:

- HTTP `200` with `{"status":"ok"}`.

Backend/UI confirmation:

1. Open frontend **Debug** tab.
2. Check **Meshtastic events** panel shows the new event.
3. If GPS normalization succeeded, confirm measurements appear for the event device in map/device views.
