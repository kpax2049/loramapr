# Pi Forwarder

`apps/pi-forwarder` sends Meshtastic packet JSON to backend ingest (`POST /api/meshtastic/event`).

## What it does

- Adds `X-API-Key` (`INGEST` scope) and `X-Idempotency-Key`.
- Forwards full packet JSON unchanged.
- Appends `_forwarder` metadata (`deviceHint`, `receivedAt`, `eventId`).
- Retries transient failures with bounded in-memory queue.

## Build and run

```bash
cd apps/pi-forwarder
npm install
npm run build
npm run start
```

Deploy copy (Pi target):

```bash
sudo rsync -az --delete apps/pi-forwarder/dist/ /opt/loramapr/pi-forwarder/dist/
sudo rsync -az apps/pi-forwarder/scripts/ /opt/loramapr/pi-forwarder/scripts/
sudo cp apps/pi-forwarder/package.json /opt/loramapr/pi-forwarder/
if [ -f apps/pi-forwarder/package-lock.json ]; then sudo cp apps/pi-forwarder/package-lock.json /opt/loramapr/pi-forwarder/; fi
```

## Environment (`src/env.ts`)

- `API_BASE_URL` (required)
- `INGEST_API_KEY` (required)
- `DEVICE_HINT` (optional)
- `SOURCE` (required): `cli` or `stdin`
- `MESHTASTIC_PORT` (optional)
- `MESHTASTIC_HOST` (optional, currently unused)
- `CLI_PATH` (optional, default `meshtastic`)
- `POLL_HEARTBEAT_SECONDS` (default `60`)
- `POST_TIMEOUT_MS` (default `8000`)
- `RETRY_BASE_MS` (default `500`)
- `RETRY_MAX_MS` (default `10000`)
- `MAX_QUEUE` (default `5000`)

## Source mode guidance

### `SOURCE=stdin` (recommended on Pi)

Use with the included bridge script:

- `apps/pi-forwarder/scripts/meshtastic-json-bridge.py`
- requires Python env with `meshtastic` installed

Example:

```bash
/home/kpax/meshtastic-venv/bin/python apps/pi-forwarder/scripts/meshtastic-json-bridge.py \
  --port /dev/serial/by-id/<copy-current-value-from-ls-output> \
| API_BASE_URL=http://192.168.178.22:3000 INGEST_API_KEY=... SOURCE=stdin node apps/pi-forwarder/dist/index.js
```

### `SOURCE=cli`

Spawns `CLI_PATH --listen [--port MESHTASTIC_PORT]` and expects JSON object output.  
If your CLI stream is mostly debug text, this mode can appear healthy but post nothing.

## Serial port exclusivity

Only one process can own `/dev/ttyACM0` (or the by-id alias) at a time.

```bash
lsof /dev/ttyACM0
ls -l /dev/serial/by-id/
```

On this hardware the by-id name can flip between:

- `usb-Seeed_TRACKER_L1_...`
- `usb-Seeed_Studio_TRACKER_L1_...`

Always set `MESHTASTIC_PORT` to the current symlink target shown by `ls -l /dev/serial/by-id/`.

Stop competing services (for example `meshtastic-logger`) before running forwarder.

## systemd

Base unit: `apps/pi-forwarder/systemd/loramapr-pi-forwarder.service`

Install:

```bash
sudo cp apps/pi-forwarder/systemd/loramapr-pi-forwarder.service /etc/systemd/system/
```

If your host user is not `pi`, override `User`/`Group` to a real account on the box.

Create env file:

```bash
sudo mkdir -p /etc/loramapr
sudo tee /etc/loramapr/pi-forwarder.env >/dev/null <<'EOF'
API_BASE_URL=http://192.168.178.22:3000
INGEST_API_KEY=replace_me
DEVICE_HINT=pi-home-node
SOURCE=stdin
MESHTASTIC_PORT=/dev/serial/by-id/<copy-current-value-from-ls-output>
POLL_HEARTBEAT_SECONDS=60
POST_TIMEOUT_MS=8000
RETRY_BASE_MS=500
RETRY_MAX_MS=10000
MAX_QUEUE=5000
EOF
```

Preflight before service restart:

```bash
sudo bash -lc '
set -a
source /etc/loramapr/pi-forwarder.env
set +a
/home/kpax/meshtastic-venv/bin/meshtastic --port "$MESHTASTIC_PORT" --info --timeout 60
'
```

For stdin bridge mode, override ExecStart:

```bash
sudo systemctl edit loramapr-pi-forwarder
```

```ini
[Service]
ExecStart=
ExecStart=/bin/bash -lc '/home/kpax/meshtastic-venv/bin/python /opt/loramapr/pi-forwarder/scripts/meshtastic-json-bridge.py --port "${MESHTASTIC_PORT}" | /usr/bin/node /opt/loramapr/pi-forwarder/dist/index.js'
```

Do not hardcode `--port /dev/...` in this override. Hardcoded paths bypass `EnvironmentFile` updates.

Repo example:

- `apps/pi-forwarder/systemd/loramapr-pi-forwarder.stdin-bridge.override.conf`

Enable and inspect:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now loramapr-pi-forwarder
sudo systemctl status loramapr-pi-forwarder --no-pager -l
sudo journalctl -u loramapr-pi-forwarder -f
```

## Smoke test + confirmation

```bash
curl -i -X POST "http://localhost:3000/api/meshtastic/event" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_INGEST_KEY" \
  -H "X-Idempotency-Key: pi-forwarder-smoke-1" \
  -d '{"fromId":"!pi-smoke","id":123,"decoded":{"portnum":"POSITION_APP","position":{"latitudeI":493959195,"longitudeI":76103928,"time":1770935010}}}'
```

Then verify:

1. `GET /api/meshtastic/events` shows new rows.
2. New rows are not `deviceUid: "unknown"` / `processingError: "missing_gps"` for valid position packets.
3. Measurements appear for that device in map views.

## Quick Troubleshooting

- `FileNotFoundError` on `/dev/serial/by-id/...`:
  - Update `MESHTASTIC_PORT` from current `ls -l /dev/serial/by-id/` output.
- `Timed out waiting for connection completion`:
  - Confirm no port lock (`lsof /dev/ttyACM0`), run `meshtastic --info --timeout 60`, then restart service.
- Repeating `stdin reached EOF`:
  - The bridge process is crashing/exiting; inspect systemd logs and fix upstream error first.
