# Pi Forwarder

`apps/pi-forwarder` is a standalone Node/TypeScript package that forwards local JSON events to backend ingest.

## Directory

- `apps/pi-forwarder/src/index.ts`: entrypoint and source selection
- `apps/pi-forwarder/src/env.ts`: env validation (`zod`)
- `apps/pi-forwarder/src/logger.ts`: `pino` logger
- `apps/pi-forwarder/src/poster.ts`: authenticated POST to backend
- `apps/pi-forwarder/src/sources/stdin.ts`: line-based stdin source
- `apps/pi-forwarder/src/sources/cli_listen.ts`: spawned CLI source parser/restart loop
- `apps/pi-forwarder/systemd/loramapr-pi-forwarder.service`: systemd unit template

## Quickstart

```bash
cd apps/pi-forwarder
npm install
npm run build
```

```bash
API_BASE_URL=http://localhost:3000 \
INGEST_API_KEY=your_ingest_key \
SOURCE=stdin \
npm run start
```

Send one JSON event:

```bash
echo '{"from":"dev-1","position":{"latitude":37.77,"longitude":-122.43}}' \
  | API_BASE_URL=http://localhost:3000 INGEST_API_KEY=your_ingest_key SOURCE=stdin npm run start
```

## CLI Source Mode

Meshtastic CLI exists and can output packet JSON while listening. Configure `SOURCE=cli` to run the CLI listener and forward each parsed packet object.

```bash
API_BASE_URL=http://localhost:3000 \
INGEST_API_KEY=your_ingest_key \
SOURCE=cli \
CLI_PATH=meshtastic \
MESHTASTIC_PORT=/dev/ttyUSB0 \
npm run start
```

The forwarder starts `meshtastic --listen` (plus `--port` when configured) and restarts the source command automatically if it exits.

## systemd

1. Build the package:
```bash
cd /path/to/repo/apps/pi-forwarder
npm install
npm run build
```
2. Copy build output to `/opt/loramapr/pi-forwarder`:
```bash
sudo mkdir -p /opt/loramapr/pi-forwarder
sudo cp -R dist /opt/loramapr/pi-forwarder/
sudo cp package.json /opt/loramapr/pi-forwarder/
sudo cp package-lock.json /opt/loramapr/pi-forwarder/
cd /opt/loramapr/pi-forwarder
sudo npm install --omit=dev
```
3. Create `/etc/loramapr/pi-forwarder.env` (example):
```bash
API_BASE_URL=http://localhost:3000
INGEST_API_KEY=replace_me
DEVICE_HINT=pi-home-node
SOURCE=cli
CLI_PATH=meshtastic
MESHTASTIC_PORT=/dev/ttyUSB0
MESHTASTIC_HOST=
POLL_HEARTBEAT_SECONDS=60
POST_TIMEOUT_MS=8000
RETRY_BASE_MS=500
RETRY_MAX_MS=10000
MAX_QUEUE=5000
```
4. Install and start the service:
```bash
sudo cp /path/to/repo/apps/pi-forwarder/systemd/loramapr-pi-forwarder.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now loramapr-pi-forwarder
```
5. Follow logs:
```bash
journalctl -u loramapr-pi-forwarder -f
```
