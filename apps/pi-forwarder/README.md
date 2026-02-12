# LoraMapr Pi Forwarder

Small Node/TypeScript process for forwarding local JSON events (stdin or CLI output) to the backend ingest endpoint.

## Install

```bash
cd apps/pi-forwarder
npm install
```

## Run

```bash
API_BASE_URL=http://localhost:3000 \
INGEST_API_KEY=your_ingest_key \
SOURCE=stdin \
npm run dev
```

Then stream JSON lines into stdin:

```bash
echo '{"from":"dev-1","position":{"latitude":37.77,"longitude":-122.43}}' | npm run dev
```

## Environment

- `API_BASE_URL` (required): backend base URL, e.g. `http://localhost:3000`
- `INGEST_API_KEY` (required): API key with `INGEST` scope
- `DEVICE_HINT` (optional): home node ID, hostname, or label
- `SOURCE` (required): `cli` or `stdin`
- `MESHTASTIC_PORT` (optional): serial port, e.g. `/dev/ttyUSB0` or `/dev/ttyACM0`
- `MESHTASTIC_HOST` (optional): reserved for TCP mode (unused for now)
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
