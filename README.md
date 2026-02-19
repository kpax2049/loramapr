# LoRaMapr

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="frontend/src/assets/branding/loramapr-logo-light.png">
    <source media="(prefers-color-scheme: light)" srcset="frontend/src/assets/branding/loramapr-logo-dark.png">
    <img alt="LoRaMapr" src="frontend/src/assets/branding/loramapr-logo-dark.png" width="520">
  </picture>
</p>

<p align="center"><sub>Self-hosted mapping, playback, and analysis for LoRa telemetry coverage.</sub></p>

> ⚠️ **Active development notice**  
> This project is under active development and is **not** a complete, production-ready app yet.  
> The goal is to reach a more or less production‑ready **v1.0.0**; until then, expect breaking changes and evolving features.

## What LoRaMapr is for

LoRaMapr is a self-hosted web app for **recording, replaying, and analyzing real-world radio coverage** using GPS-tagged telemetry. You collect measurements while walking/driving with a device, LoRaMapr groups them into **sessions**, and the UI lets you **visualize tracks, compare reception, and export data** (e.g., GeoJSON).

The key idea: LoRaMapr does not require your devices to talk to the web app directly. Instead, it ingests data through the system that already receives your radio packets.

## How data gets into LoRaMapr (two common ingestion methods)

### 1) LoRaWAN (The Things Stack webhook) — most common if you already use TTS/TTN

**Real-world setup**

- **You own**: a LoRaWAN end device (your sensor/tracker)
- **Gateways**: can be yours or community/public gateways (any gateway that hears your device helps)
- **The Things Stack (TTS/TTN)**: the network server that receives gateway traffic for your application
- **LoRaMapr**: your backend + UI

**How ingestion works**

1. Your device transmits an uplink over LoRa.
2. One or more gateways receive it and forward it to The Things Stack.
3. You configure a **Webhook integration** in The Things Stack by entering LoRaMapr's **HTTPS URL** (and a secret).
4. The Things Stack automatically **POSTs each uplink event** to LoRaMapr.
5. LoRaMapr stores the event, extracts GPS + radio metadata (RSSI/SNR, gateway IDs when available), and attaches the data to your sessions for visualization.

### 2) Meshtastic (Forwarder -> HTTP) — most common for local mesh + home node setups

**Real-world setup (typical)**

- **You own**: one or more Meshtastic field nodes you carry while walking/driving
- **You own**: a receiver node at home (often configured with a standard preset like **LongFast**) plus a small computer (often a Raspberry Pi)
- Field nodes and the home node commonly communicate on a **private channel** (so your test traffic stays scoped to your own devices)
- **LoRaMapr**: your backend + UI

**How ingestion works**

1. Field node(s) transmit packets into the mesh.
2. Your home node hears them.
3. A small forwarder process (the **Pi Forwarder**) listens to Meshtastic packets locally and **POSTs them to LoRaMapr** over HTTP/HTTPS.
4. LoRaMapr stores the events and normalizes GPS (and any available telemetry) into measurements attached to sessions.

Important: Meshtastic is **not limited to a home node**. The forwarder can run on any machine that can read Meshtastic packets (Pi, laptop over USB, etc.). A home node is just the most convenient always-on receiver.

## What users typically do with it

- Record a "walk" or "drive" session and replay it later.
- Compare coverage between antennas, device placement, or firmware settings by repeating the same route.
- Inspect reception details (especially strong with LoRaWAN where gateways report RSSI/SNR).
- Export session tracks/points (GeoJSON) for external tools like QGIS.
- **Planned:** aggregate sessions into an area **coverage heat map** (fast, reusable coverage summaries across routes and date ranges).

## Tech stack

- Backend: Node.js + TypeScript + NestJS
- Frontend: React + Vite + TypeScript
- Data: PostgreSQL + Prisma
- Supporting libs: RxJS, class-validator, class-transformer

## Documentation

- GitHub Wiki: https://github.com/kpax2049/loramapr/wiki

## Quickstart (first-time users, working UI)

Start the dev stack (postgres + backend + frontend):
```bash
cp .env.example .env
docker compose up -d --build
```

No manual `npm install` is required for runtime; containers install and run dependencies.

Default URLs/ports after startup:

- Frontend UI: `http://localhost:5173`
- Backend API: `http://localhost:3000`
- Health: `http://localhost:3000/health`
- Readiness: `http://localhost:3000/readyz`

These values are controlled by `.env` (`FRONTEND_PORT`, `API_PORT`).

## What to expect

- Backend listens on `http://localhost:3000`
- Frontend listens on `http://localhost:5173`
- Postgres runs as the `postgres` service
- Migrations are applied automatically in the Docker backend flow (`docker compose up --build`)

## Health check

```bash
curl http://localhost:3000/health
curl http://localhost:3000/readyz
```

- `/health`: process-level liveness
- `/readyz`: DB readiness (`503` when database is unreachable)

## Running locally (contributors)

```bash
npm install
cp .env.example .env
docker compose up -d postgres
# IMPORTANT: when backend runs on host (not in docker), edit .env and set:
# DATABASE_URL=postgres://postgres:postgres@localhost:5432/loramapr
npm run db:migrate
npm run start:dev
```

## Full-stack dev (backend + frontend)

Run both servers together:
```bash
npm run dev:all
```

Or run them separately:
```bash
npm run start:dev
npm --prefix frontend run dev
```

## See data in the map

1) Run the simulator to ingest sample points:
```bash
npm run simulate:walk -- --apiKey YOUR_KEY --deviceUid dev-1 --baseLat 37.77 --baseLon -122.43 --minutes 15 --intervalSec 5 --seed demo
```
2) Open the frontend dev server in your browser.
3) Select the device in the dropdown to see points and track.

### Meshtastic ingest (MVP)

Post Meshtastic JSON payloads to:
```bash
POST /api/meshtastic/event
```
Use an `X-API-Key` with `INGEST` scope. Meshtastic events create webhook events, and if GPS data is present, measurements will appear in the map.

### Debug panels (QUERY key)

The LoRaWAN and Meshtastic debug panels require `VITE_QUERY_API_KEY` (QUERY scope) in `frontend/.env`.

### Playback

Session playback mode supports scrubber, keyboard shortcuts, and time-window slicing for deterministic replay.

## Docker dev workflow (backend)

Use the Quickstart above for the recommended flow.

## API key generation

Create an ingestion API key:
```bash
npm run apikey:mint -- --scopes INGEST --label "dev ingest key"
```

Use the printed key in the `X-API-Key` header.

## Simulate measurement walk

Generate and ingest a synthetic walk (posts to `POST /api/measurements` in batches):
```bash
npm run simulate:walk -- --apiKey YOUR_KEY --deviceUid dev-1 --baseLat 37.77 --baseLon -122.43 --minutes 15 --intervalSec 5 --seed demo
```

## Seed richer demo data (DB)

Use the seed script when you want more than a single walk. It writes a larger test dataset directly to Postgres, including:

- multiple devices and sessions
- many measurements across several days
- per-gateway Rx metadata
- precomputed coverage bins

Run:

```bash
npx ts-node scripts/seed-data.ts --db
```

Optional controls:

```bash
SEED=1337 CENTER_LAT=37.7749 CENTER_LON=-122.4194 OWNER_USER_ID=<uuid> npx ts-node scripts/seed-data.ts --db
```

If you only want the generated payload (no DB writes):

```bash
npx ts-node scripts/seed-data.ts --json > tmp/dummy.json
```

## Build and run

```bash
npm run build
npm start
```

## Troubleshooting

```bash
docker compose logs postgres --tail=200
docker compose logs backend --tail=200
docker compose down -v
docker compose up --build
```

If you see a Prisma engine mismatch (darwin vs linux), run:
```bash
docker compose down -v
docker compose up --build
```

If `npm ci` fails, ensure you are using the committed `package-lock.json` and rebuild.

Common ports:
- Backend: 3000
- Frontend dev server: 5173
- Postgres: 5432

If API requests fail in the browser, check that `frontend/.env` has `VITE_API_BASE_URL=http://localhost:3000` and restart the Vite dev server.

## Contributor note

- Use `prisma migrate dev` only when changing schema; otherwise use `prisma migrate deploy` (the default in Docker).
