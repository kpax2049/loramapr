# Pi Forwarder

`apps/pi-forwarder` is a standalone Node/TypeScript package that forwards local Meshtastic JSON events to backend ingest (`POST /api/meshtastic/event`).

This guide reflects the real end-to-end debugging we did on this Pi, including serial naming, systemd user/env issues, and Meshtastic CLI runtime behavior.

## What it is / prerequisites

- Raspberry Pi host with Node.js/npm installed.
- Meshtastic CLI available locally (global install or Python venv binary).
- Backend reachable and an `INGEST` API key ready.
- USB-connected Meshtastic device.

Meshtastic CLI can emit JSON packets while listening; the forwarder consumes those JSON objects and posts them to the backend.

Current behavior in this repo:

- Forwarder parses JSON objects from CLI `stdout` when available.
- If Meshtastic emits packet dictionaries/debug text on `stderr` (our Pi setup), forwarder has a fallback parser for `packet={...}` lines and extracts `from`/`packetId`/`lat`/`lon`/`timestamp`.
- Non-actionable stderr noise is throttled to debug logs.

Project paths:

- App: `apps/pi-forwarder`
- Unit template: `apps/pi-forwarder/systemd/loramapr-pi-forwarder.service`
- This doc: `docs/pi-forwarder.md`

## Choose API_BASE_URL correctly

This is the critical config choice:

- Use `API_BASE_URL=http://localhost:3000` only when LoraMapr backend is running on the same Pi host as pi-forwarder.
- Use `API_BASE_URL=http://<loramapr-server-ip>:3000` when backend runs on another host (at minimum, set the server IP/hostname correctly).

Common mistake:

- If backend is remote but `API_BASE_URL` is `localhost`, pi-forwarder posts to itself and your real server receives nothing.

## Local dev quickstart (stdin)

From repo root:

```bash
cd apps/pi-forwarder
npm install
npm run build
```

Local pipe test:

```bash
echo '{"from":"testNode","lat":37.77,"lon":-122.42}' | \
API_BASE_URL=http://localhost:3000 \
INGEST_API_KEY=your_ingest_key \
SOURCE=stdin \
node dist/index.js
```

Expected result:

- Forwarder starts, parses one line, posts to backend.
- Logs include success counters/heartbeat.

## CLI mode quickstart (find port + wrapper)

### 1) Find the correct serial device

Do not assume `/dev/ttyUSB0`. For Seeed Tracker L1 on this Pi, the stable path resolves to `/dev/ttyACM0`.

Use:

```bash
ls -l /dev/serial/by-id/
```

Use the by-id path in config, for example:

`/dev/serial/by-id/usb-Seeed_Tracker_L1_... -> ../../ttyACM0`

### 2) Create a Meshtastic wrapper script (recommended)

`CLI_PATH=meshtastic` often fails in systemd when PATH differs for the service user. In this setup Meshtastic lives in a venv, so create an explicit wrapper:

```bash
mkdir -p /home/kpax/bin
cat >/home/kpax/bin/meshtastic-wrapper <<'EOF'
#!/usr/bin/env bash
export MESHTASTIC_LOG_LEVEL=WARNING
exec /home/kpax/meshtastic-venv/bin/meshtastic "$@"
EOF
chmod +x /home/kpax/bin/meshtastic-wrapper
```

### 3) Run in CLI mode

```bash
API_BASE_URL=http://localhost:3000 \
INGEST_API_KEY=your_ingest_key \
SOURCE=cli \
CLI_PATH=/home/kpax/bin/meshtastic-wrapper \
MESHTASTIC_PORT=/dev/serial/by-id/usb-Seeed_Tracker_L1_... \
node dist/index.js
```

## Conflict with existing logger service (port lock)

If another service already owns the serial port (for example `meshtastic-logger.service`), forwarder CLI mode cannot connect.

Check lock holder:

```bash
lsof /dev/ttyACM0
```

If logger owns the port, stop/disable it before running pi-forwarder:

```bash
sudo systemctl stop meshtastic-logger
sudo systemctl disable meshtastic-logger
```

## systemd install (build, copy to /opt, install deps, create env file, install unit)

### 1) Build

```bash
cd /path/to/repo/apps/pi-forwarder
npm install
npm run build
```

### 2) Copy to `/opt/loramapr/pi-forwarder`

```bash
sudo mkdir -p /opt/loramapr/pi-forwarder
sudo cp -R dist /opt/loramapr/pi-forwarder/
sudo cp package.json /opt/loramapr/pi-forwarder/
if [ -f package-lock.json ]; then sudo cp package-lock.json /opt/loramapr/pi-forwarder/; fi
```

Install production deps:

```bash
cd /opt/loramapr/pi-forwarder
if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi
```

Notes:

- `npm ci` requires `package-lock.json`; without lockfile, use `npm install --omit=dev`.
- Avoid running npm as root when possible; use a writable deploy directory/user flow.
- If npm registry is flaky (`ECONNRESET`), retry and/or tune retries:

```bash
npm config set fetch-retries 5
npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 120000
```

### 3) Create `/etc/loramapr/pi-forwarder.env`

Important: systemd loads this file via `EnvironmentFile=`. Wrong values here override what you tested manually and were the root cause in our debugging.

```bash
API_BASE_URL=http://localhost:3000
INGEST_API_KEY=replace_me
DEVICE_HINT=pi-home-node
SOURCE=cli
CLI_PATH=/home/kpax/bin/meshtastic-wrapper
MESHTASTIC_PORT=/dev/serial/by-id/usb-Seeed_Tracker_L1_...
MESHTASTIC_HOST=
POLL_HEARTBEAT_SECONDS=60
POST_TIMEOUT_MS=8000
RETRY_BASE_MS=500
RETRY_MAX_MS=10000
MAX_QUEUE=5000
```

If backend is not running on this Pi, change at least:

```bash
API_BASE_URL=http://192.168.x.y:3000
```

### 4) Install unit and set correct runtime user

The template in repo uses `User=pi`/`Group=pi`. On this box the real user is `kpax`; leaving `pi` causes `status=217/USER` and `Failed to determine user credentials`.

Install base unit:

```bash
sudo cp /path/to/repo/apps/pi-forwarder/systemd/loramapr-pi-forwarder.service /etc/systemd/system/
```

Create override for user/group:

```bash
sudo systemctl edit loramapr-pi-forwarder
```

Add:

```ini
[Service]
User=kpax
Group=kpax
```

Then enable/start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now loramapr-pi-forwarder
```

### 5) Verify service behavior

```bash
systemctl status loramapr-pi-forwarder
journalctl -u loramapr-pi-forwarder -f
```

Good signs:

- `systemctl status` shows Node `dist/index.js` running.
- In CLI mode, a spawned Meshtastic Python process is visible under the same service cgroup.
- Journal shows heartbeat with queue length and success/failure counters.
- Journal shows successful POST activity and `successfulPosts` increasing over time.

## Troubleshooting matrix (symptom -> cause -> fix)

| Symptom | Likely cause | Fix |
|---|---|---|
| `spawn meshtastic ENOENT` | `CLI_PATH` not resolvable for service user PATH | Set absolute `CLI_PATH` to wrapper (for example `/home/kpax/bin/meshtastic-wrapper`) and ensure `chmod +x`. |
| `File Not Found` for `/dev/ttyUSB0` | Wrong serial path for this hardware | Use `ls -l /dev/serial/by-id/` and set `MESHTASTIC_PORT` to the by-id path that resolves to `/dev/ttyACM0`. |
| `Could not exclusively lock port` | Another process owns port (`meshtastic-logger` etc.) | `lsof /dev/ttyACM0`, stop/disable conflicting service, restart forwarder. |
| `status=217/USER` / `Failed to determine user credentials` | Unit `User`/`Group` do not exist on host | Override unit to real user/group (`kpax` on this box). |
| Events only appear with manual curl, service posts stay at 0 | Older forwarder build cannot parse your Meshtastic CLI output format | Update to latest `apps/pi-forwarder` build; current CLI source includes stderr `packet={...}` fallback parsing. |
| Service is healthy but no events on backend | `API_BASE_URL` points to the wrong host | Use `localhost` only for same-host backend; otherwise set backend server IP/hostname in `/etc/loramapr/pi-forwarder.env`. |
| npm `ECONNRESET` while installing | Registry/network instability | Retry, set npm retry config, use `--no-audit --no-fund`, avoid root npm flow when possible. |

## Minimal known-good configs

### Example env file

`/etc/loramapr/pi-forwarder.env`:

```bash
API_BASE_URL=http://localhost:3000
INGEST_API_KEY=replace_me
DEVICE_HINT=pi-home-node
SOURCE=cli
CLI_PATH=/home/kpax/bin/meshtastic-wrapper
MESHTASTIC_PORT=/dev/serial/by-id/usb-Seeed_Tracker_L1_...
POLL_HEARTBEAT_SECONDS=60
POST_TIMEOUT_MS=8000
RETRY_BASE_MS=500
RETRY_MAX_MS=10000
MAX_QUEUE=5000
```

### Example env file (backend on another host)

`/etc/loramapr/pi-forwarder.env`:

```bash
API_BASE_URL=http://192.168.178.22:3000
INGEST_API_KEY=replace_me
DEVICE_HINT=pi-home-node
SOURCE=cli
CLI_PATH=/home/kpax/bin/meshtastic-wrapper
MESHTASTIC_PORT=/dev/serial/by-id/usb-Seeed_Tracker_L1_...
POLL_HEARTBEAT_SECONDS=60
POST_TIMEOUT_MS=8000
RETRY_BASE_MS=500
RETRY_MAX_MS=10000
MAX_QUEUE=5000
```

### Example unit override

`/etc/systemd/system/loramapr-pi-forwarder.service.d/override.conf`:

```ini
[Service]
User=kpax
Group=kpax
```
