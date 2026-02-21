# Pi Forwarder

`apps/pi-forwarder` forwards Meshtastic packet JSON into backend ingest (`POST /api/meshtastic/event`).

This document reflects the exact recovery path used in production on the Pi:

- serial lock conflicts
- serial by-id path label changes after reboot/replug
- `SOURCE=cli` vs `SOURCE=stdin`
- systemd EOF loops when stdin producer is missing
- Meshtastic handshake timeout (`Timed out waiting for connection completion`)
- bridge serialization errors (`Telemetry` / `Position` not JSON serializable)

## What it does

Forwarder POST body is:

```json
{
  "...packet fields": "unchanged",
  "_forwarder": {
    "deviceHint": "optional",
    "receivedAt": "ISO timestamp",
    "eventId": "idempotency key"
  }
}
```

Notes:

- Forwarder does not normalize GPS/radio fields.
- Backend worker performs normalization and writes measurements.
- Idempotency prefers packet `id`; otherwise hash of full JSON payload.

## Choose API_BASE_URL correctly

- Use `API_BASE_URL=http://localhost:3000` only if backend runs on the same Pi.
- Otherwise set backend host IP/hostname, for example:
  - `API_BASE_URL=http://192.168.178.22:3000`

## Source modes

### `SOURCE=stdin` (recommended on this Pi)

Use this when Meshtastic CLI output is not clean JSON lines.

Feed stdin with a JSON bridge process:

- `apps/pi-forwarder/scripts/meshtastic-json-bridge.py`
- requires a Python environment with `meshtastic` (and its deps) installed

This avoids CLI output format drift and preserves full packet objects.

### `SOURCE=cli`

Forwarder spawns `CLI_PATH --listen [--port MESHTASTIC_PORT]` and expects JSON object lines.

If your CLI emits Python/debug text instead of JSON objects, `SOURCE=cli` can run with heartbeats but post nothing (`successfulPosts=0`).

## Serial device + lock checks

Use stable by-id paths:

```bash
ls -l /dev/serial/by-id/
```

On this hardware, the symlink label can change between boots:

- `usb-Seeed_TRACKER_L1_...`
- `usb-Seeed_Studio_TRACKER_L1_...`

Always copy the current path from `ls -l /dev/serial/by-id/` into `MESHTASTIC_PORT`.
If by-id naming keeps changing, use `/dev/ttyACM0` as a fallback.

Check lock owner:

```bash
lsof /dev/ttyACM0
```

If another service owns the device (for example `meshtastic-logger.service`), stop it before running forwarder.

## Build and deploy to `/opt`

```bash
cd /path/to/repo/apps/pi-forwarder
npm install
npm run build

sudo mkdir -p /opt/loramapr/pi-forwarder
sudo rsync -az --delete dist/ /opt/loramapr/pi-forwarder/dist/
sudo rsync -az scripts/ /opt/loramapr/pi-forwarder/scripts/
sudo cp package.json /opt/loramapr/pi-forwarder/
if [ -f package-lock.json ]; then sudo cp package-lock.json /opt/loramapr/pi-forwarder/; fi
```

Install runtime deps:

```bash
cd /opt/loramapr/pi-forwarder
if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi
```

## Env file

`/etc/loramapr/pi-forwarder.env` is authoritative in systemd mode.

Example (stdin + bridge mode):

```bash
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
```

## Preflight serial handshake

Before restarting the service, verify Meshtastic can connect on the configured port:

```bash
sudo bash -lc '
set -a
source /etc/loramapr/pi-forwarder.env
set +a
/home/kpax/meshtastic-venv/bin/meshtastic --port "$MESHTASTIC_PORT" --info --timeout 60
'
```

If this command times out, fix node/USB/port ownership first. Forwarder cannot ingest until this succeeds.

## systemd setup

Base unit template:

- `apps/pi-forwarder/systemd/loramapr-pi-forwarder.service`

Install:

```bash
sudo cp apps/pi-forwarder/systemd/loramapr-pi-forwarder.service /etc/systemd/system/
```

Set correct runtime user/group (do not assume `pi` exists):

```bash
sudo systemctl edit loramapr-pi-forwarder
```

```ini
[Service]
User=kpax
Group=kpax
```

For stdin + bridge mode, add an ExecStart override:

```bash
sudo systemctl edit loramapr-pi-forwarder
```

```ini
[Service]
ExecStart=
ExecStart=/bin/bash -lc '/home/kpax/meshtastic-venv/bin/python /opt/loramapr/pi-forwarder/scripts/meshtastic-json-bridge.py --port "${MESHTASTIC_PORT}" | /usr/bin/node /opt/loramapr/pi-forwarder/dist/index.js'
```

Important:

- Do not hardcode `--port /dev/...` inside `ExecStart`.
- If `ExecStart` hardcodes the port, updates in `/etc/loramapr/pi-forwarder.env` are ignored.

Example override file in repo:

- `apps/pi-forwarder/systemd/loramapr-pi-forwarder.stdin-bridge.override.conf`

Apply:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now loramapr-pi-forwarder
sudo systemctl status loramapr-pi-forwarder --no-pager -l
```

## Verification checklist

Tail service logs:

```bash
sudo journalctl -u loramapr-pi-forwarder -f
```

Healthy signs:

- `successfulPosts` increases over time.
- `lastSuccessAt` updates.
- No repeating `stdin reached EOF` loop.

Backend checks:

```bash
curl -s -H "X-API-Key: $QUERY_API_KEY" \
  "http://192.168.178.22:3000/api/meshtastic/events?limit=10" | jq .
```

For a specific node:

```bash
curl -s -H "X-API-Key: $QUERY_API_KEY" \
  "http://192.168.178.22:3000/api/meshtastic/events?deviceUid=%21136a4454&limit=1" | jq .
```

## Troubleshooting matrix

| Symptom | Cause | Fix |
|---|---|---|
| `successfulPosts=0` forever in CLI mode | Source stream has no JSON object lines | Use `SOURCE=stdin` + bridge or adapt CLI source parser. |
| `stdin reached EOF` every restart | stdin producer missing/crashed | Fix `ExecStart` pipeline and bridge path. |
| `FileNotFoundError: ... /dev/serial/by-id/...` | `MESHTASTIC_PORT` points to stale by-id path | Run `ls -l /dev/serial/by-id/`, update env, restart service. |
| `MeshInterfaceError: Timed out waiting for connection completion` | Serial device exists but node handshake failed | Stop competing processes, run `meshtastic --info --timeout 60`, power-cycle/replug node, then restart forwarder. |
| Env edit had no effect | `ExecStart` override hardcodes `--port` | Change override to `--port "${MESHTASTIC_PORT}"`, `daemon-reload`, restart. |
| `can't open file ... meshtastic-json-bridge.py` | Bridge script not deployed | Copy `apps/pi-forwarder/scripts/meshtastic-json-bridge.py` to `/opt/.../scripts/`. |
| `bridgeError: Object of type Telemetry/Position is not JSON serializable` | Old/incomplete bridge serializer | Use repo bridge script with protobuf/object conversion. |
| `deviceUid: "unknown"` + `processingError: "missing_gps"` | Bridge emitted error object instead of packet, or non-position event | Inspect event payload via `/api/meshtastic/events/:id`; fix bridge output shape. |
| Serial `Could not exclusively lock port` | Another process owns serial device | `lsof /dev/ttyACM0`; stop conflicting service (for example `meshtastic-logger`). |
| `status=217/USER` | Unit user/group invalid on host | Override `User`/`Group` to real user on box. |
| Backend gets no events | Wrong `API_BASE_URL` | Use backend host IP/hostname (not localhost when backend is remote). |

## Minimal smoke test (manual)

```bash
echo '{"fromId":"!test","id":123,"decoded":{"portnum":"POSITION_APP","position":{"latitudeI":493959195,"longitudeI":76103928,"time":1770935010}}}' | \
API_BASE_URL=http://localhost:3000 \
INGEST_API_KEY=replace_me \
SOURCE=stdin \
node /opt/loramapr/pi-forwarder/dist/index.js
```

Expected:

- backend returns `200` for ingest
- event appears in Meshtastic events list
- if GPS fields are present, measurement is created by worker
