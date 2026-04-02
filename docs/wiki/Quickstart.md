# Quickstart

LoRaMapr is a Meshtastic app for mapping real-world coverage around a fixed location such as your home. It uses one node at the base location and a second field node to build coverage maps from real packet data.

This quickstart sets up that workflow.

Default testing model:

- fixed base receiver + mobile field node
- most commonly a home node plus a field node

## Receiver host requirements (standard Meshtastic workflow)

For the standard home/base + field-node workflow, you need:

- one node left at a fixed location (home/base/relay)
- one field node for walks or drives
- a Linux machine or Raspberry Pi at the fixed location running the Receiver service (`Pi Forwarder`)
- network access from that Receiver host to your LoRaMapr Cloud endpoint (or self-hosted API endpoint)

The Receiver service ingests Meshtastic packets from your fixed-location node and forwards them to LoRaMapr Cloud for sessions, playback, and coverage maps.

Receiver host baseline:

- Minimum: `1 vCPU`, `512 MB RAM`, `2 GB` free disk, stable network path, and reliable USB data connection (if direct USB node)
- Recommended: `2 vCPU`, `1 GB RAM`, `4 GB+` free disk, plus stable power/network/storage for long-running receiver use
- Raspberry Pi: minimum proven is Pi Zero 2 W (`512 MB`); recommended is Pi 3/4 class with quality power and SD card

## Prerequisites

- Docker
- Docker Compose (`docker compose`)
- `make` (or use `./bin/loramapr` with the same subcommands)

## First Run (Clean Clone)

### 1) Clone

```bash
git clone https://github.com/kpax2049/loramapr.git
cd loramapr
```

### 2) Create env

```bash
cp .env.example .env
```

Alternative: `make keys` also creates `.env` automatically if missing.

### 3) Generate local keys (optional but recommended)

```bash
make keys
```

`make keys` runs the generator in a temporary `node:20-alpine` container, so this works on a host with only Docker + Docker Compose installed.
It writes keys to root `.env` and syncs `frontend/.env` (`VITE_QUERY_API_KEY`) so browser requests include `X-API-Key`.

### 4) Start stack

`make up` starts `postgres`, `backend`, and `frontend`.
On backend startup, the API container now:

1. waits for DB readiness,
2. runs `prisma migrate deploy`,
3. registers `QUERY_API_KEY` / `INGEST_API_KEY` from env into the `ApiKey` table (idempotent),
4. then starts Nest.

```bash
make up
```

### 5) Open app

- Frontend UI: `http://localhost:5173`
- Backend API: `http://localhost:3000`
- Health: `http://localhost:3000/health`
- Healthz: `http://localhost:3000/healthz`
- Readiness: `http://localhost:3000/readyz`

### 6) Optional: enable Home Auto Session (HAS)

Use HAS when you are running repeated fixed-base + mobile-field coverage tests and want less manual start/stop handling.

- In the UI, open **Device** tab -> **Home Auto Session (HAS)**.
- Configure `homeLat`, `homeLon`, `radiusMeters`, and outside/inside thresholds.
- Enable the workflow and save.
- Run the Home Auto Session (HAS) agent so runs can open/close automatically from base-side activity.

See [[Hands-Free-Sessions|Home Auto Session (HAS)]] for behavior details and setup expectations.

## Health endpoints

- `/healthz`: liveness only, no DB check. Use it to confirm the API process is running.
- `/readyz`: readiness check with DB probe (`SELECT 1`). Returns `200` only when DB is reachable.

## Diagnose "not ready"

If `/readyz` is not `200`, inspect API and Postgres logs:

```bash
docker compose logs backend -n 200 --no-log-prefix
docker compose logs postgres -n 200 --no-log-prefix
```

Look for startup flow messages from the API container:

- `[api-entrypoint] Waiting for database availability...`
- `[api-entrypoint] Running prisma migrate deploy...`
- migration or DB connection errors

## Common Operations

### Stop

```bash
make down
```

### Reset data (destructive)

```bash
make reset
```

### Seed demo data

If `scripts/seed-data.ts` exists, this seeds demo records:

```bash
make demo
```

If `make` is unavailable, use equivalent commands:

```bash
./bin/loramapr up
./bin/loramapr down
./bin/loramapr reset
./bin/loramapr demo
./bin/loramapr keys
```
