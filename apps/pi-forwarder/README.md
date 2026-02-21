# LoraMapr Pi Forwarder

`apps/pi-forwarder` forwards Meshtastic packet JSON to backend ingest:

- endpoint: `POST /api/meshtastic/event`
- auth: `X-API-Key` (`INGEST` scope)
- idempotency: `X-Idempotency-Key`
- payload: full packet object + `_forwarder` metadata

## Install / build

```bash
cd apps/pi-forwarder
npm install
npm run build
```

## Runtime modes

### `SOURCE=stdin` (recommended on Pi)

Use when Meshtastic CLI output is not clean JSON (common with Python/debug output).

```bash
API_BASE_URL=http://localhost:3000 \
INGEST_API_KEY=your_ingest_key \
SOURCE=stdin \
node dist/index.js
```

Then pipe JSON lines into stdin:

```bash
echo '{"fromId":"!abc123","id":123,"decoded":{"portnum":"POSITION_APP","position":{"latitudeI":493959195,"longitudeI":76103928,"time":1770935010}}}' | node dist/index.js
```

Bridge script for Meshtastic pubsub packets:

- `scripts/meshtastic-json-bridge.py`
- requires Python env with `meshtastic` installed

Example pipeline:

```bash
/home/kpax/meshtastic-venv/bin/python scripts/meshtastic-json-bridge.py \
  --port /dev/serial/by-id/<copy-current-value-from-ls-output> \
| API_BASE_URL=http://localhost:3000 INGEST_API_KEY=... SOURCE=stdin node dist/index.js
```

Before running, confirm the current serial path:

```bash
ls -l /dev/serial/by-id/
```

On Seeed Tracker L1, by-id labels may change between `usb-Seeed_TRACKER_L1_...` and
`usb-Seeed_Studio_TRACKER_L1_...` after reboot/replug, so do not assume one fixed string.

### `SOURCE=cli`

Forwarder spawns:

- `CLI_PATH --listen`
- plus `--port <MESHTASTIC_PORT>` when set

This mode expects JSON object lines from the source stream. If serial is already in use by another process, CLI mode will fail to read packets.

## Environment

- `API_BASE_URL` (required): backend URL, e.g. `http://localhost:3000` or `http://192.168.x.y:3000`
- `INGEST_API_KEY` (required): key with `INGEST` scope
- `DEVICE_HINT` (optional): node/site label
- `SOURCE` (required): `cli` or `stdin`
- `MESHTASTIC_PORT` (optional): `/dev/serial/by-id/...` preferred
- `MESHTASTIC_HOST` (optional): reserved for future TCP mode
- `CLI_PATH` (optional, default `meshtastic`)
- `POLL_HEARTBEAT_SECONDS` (optional, default `60`)
- `POST_TIMEOUT_MS` (optional, default `8000`)
- `RETRY_BASE_MS` (optional, default `500`)
- `RETRY_MAX_MS` (optional, default `10000`)
- `MAX_QUEUE` (optional, default `5000`)

## Scripts

- `npm run dev` - run with `ts-node`
- `npm run build` - compile to `dist`
- `npm run start` - run compiled output

## Systemd Note

If you use a systemd override for stdin bridge mode, keep the port dynamic:

```ini
ExecStart=/bin/bash -lc '/home/kpax/meshtastic-venv/bin/python /opt/loramapr/pi-forwarder/scripts/meshtastic-json-bridge.py --port "${MESHTASTIC_PORT}" | /usr/bin/node /opt/loramapr/pi-forwarder/dist/index.js'
```

Do not hardcode `--port /dev/...` in `ExecStart`, or env-file updates to `MESHTASTIC_PORT` will be ignored.

## Serial Handshake Check

If ingest is not flowing, verify Meshtastic can connect before starting forwarder:

```bash
/home/kpax/meshtastic-venv/bin/meshtastic --port "$MESHTASTIC_PORT" --info --timeout 60
```

If this times out, fix serial ownership/node state first (`lsof /dev/ttyACM0`, replug/power-cycle node).
