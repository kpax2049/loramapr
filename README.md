# LoRaMapr

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="frontend/src/assets/branding/loramapr-logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="frontend/src/assets/branding/loramapr-logo-light.png">
    <img alt="LoRaMapr" src="frontend/src/assets/branding/loramapr-logo-dark.png" width="520">
  </picture>
</p>

> ✅ **Stable release (v1.1.0)**  
> LoRaMapr has reached **v1.1.0** and is ready for self-hosted use.  
> Development continues for new features and refinements, with changes tracked through normal release/version notes.

LoRaMapr is a self-hosted coverage-mapping tool for Meshtastic.

Leave one node at a fixed base location, carry another through the field, and record real packet data during walks or drives. LoRaMapr turns those runs into replayable coverage maps so you can see where your setup actually works.

Use LoRaMapr to compare antennas, placement, routes, terrain, and settings using real measurements instead of guesswork.

### Who it is for

- Meshtastic users testing coverage from a home, base, or relay location
- People comparing antenna placement or node setup
- Users who want real measured coverage, not just node positions on a map

## What's in v1.1.0

- Meshtastic-first ingest path via **Pi Forwarder**, plus supported **LoRaWAN** ingest via TTS webhooks.
- Session-first workflow for manual capture and **Home Auto Session (HAS)** support for hands-free Meshtastic coverage runs.
- Coverage workflow with **Bins + Heatmap** visualization and **Device vs Session** scope switching.
- Production-ready self-hosting baseline with Docker Compose, reverse proxy, health/readiness checks, and startup migration flow.
- Built-in operational tooling for API keys, database backup/restore, and retention safety defaults.
- Expanded project documentation in the GitHub Wiki for quickstart, deployment, ingestion, troubleshooting, and operations.

<p align="center">
  <img alt="LoRaMapr session details and signal charts" src="docs/assets/ui-session-details-signal.png?v=20260225" width="980">
</p>

<p align="center">
  <img alt="LoRaMapr coverage mode view" src="docs/assets/ui-coverage-map.png" width="980">
</p>

## How coverage mapping works

Best fit: fixed base + mobile field testing.

Most commonly, that means a home node and a field node:

1. Leave one node at home, at a relay site, or at another fixed base location.
2. Carry another node through the field on a walk or drive.
3. Let your receiver path send packets into LoRaMapr.
4. Review sessions, playback, coverage views, and exports to see where packets were actually received.

Run capture can be manual, or automated with Home Auto Session (HAS) for base-driven workflows.

`Home node + field node` is the default pattern, but not the only valid setup.

## How data gets into LoRaMapr (supported ingest paths)

### 1) Meshtastic (Forwarder -> HTTP) — primary coverage-mapping workflow

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/LoRaMapr_Meshtastic_ingest_diagram_dark.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/LoRaMapr_Meshtastic_ingest_diagram_light.png">
    <img alt="LoRaMapr Meshtastic ingestion flow" src="docs/assets/readme/LoRaMapr_Meshtastic_ingest_diagram_light.png" width="980">
  </picture>
</p>

**Real-world setup (typical)**

- **You own**: one or more Meshtastic field nodes you carry while walking/driving
- **You own**: a fixed receiver node (often at home) plus a small computer (often a Raspberry Pi)
- Field node(s) and base node commonly run on a private channel for repeatable testing
- **LoRaMapr**: your self-hosted backend + UI

**How ingestion works**

1. Field node(s) transmit packets into the mesh.
2. Your fixed base node hears them.
3. The **Pi Forwarder** listens to Meshtastic packets locally and **POSTs them to LoRaMapr** over HTTP/HTTPS.
4. LoRaMapr stores the events and normalizes GPS/radio fields into measurements attached to sessions.

Home Auto Session (HAS) supports a home-driven coverage workflow: leave one node at your base location, carry another through the field, and let the base-side workflow automatically open and close coverage runs around real activity. This reduces manual session handling and makes repeated walks or drives easier to capture consistently.

Important: Meshtastic is **not limited to a home node**. The forwarder can run on any machine that can read Meshtastic packets (Pi, laptop over USB, etc.).

### 2) LoRaWAN (The Things Stack webhook) — supported secondary path

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/LoRaMapr_LoRaWAN_ingest_diagram_dark.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/LoRaMapr_LoRaWAN_ingest_diagram_light.png">
    <img alt="LoRaMapr LoRaWAN ingestion flow" src="docs/assets/readme/LoRaMapr_LoRaWAN_ingest_diagram_light.png" width="980">
  </picture>
</p>

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

## What users typically do with it

- Record a walk/drive coverage run and replay it later.
- Compare antennas, node placement, terrain, routes, and settings by repeating the same route over time.
- Use Coverage **Bins** and **Heatmap** views to see where packets were actually received.
- Use **Home Auto Session (HAS)** to capture repeated field runs with less manual session management.
- Inspect reception details (especially strong with LoRaWAN where gateways report RSSI/SNR).
- Export session tracks/points (GeoJSON) for external tools like QGIS.

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
make keys
make up
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

For local Docker-first setup, generate (or preserve existing) QUERY/INGEST keys:
```bash
make keys
```

Advanced/manual minting is also available:
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

Prod compose equivalents:
```bash
docker compose -f docker-compose.prod.yml logs postgres --tail=200
docker compose -f docker-compose.prod.yml logs api --tail=200
docker compose -f docker-compose.prod.yml logs reverse-proxy --tail=200
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
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

If API requests fail in dev, check that `frontend/.env` has `VITE_API_BASE_URL=http://localhost:3000` and restart the Vite dev server. In production, frontend requests use same-origin `/api/*` by default (leave `VITE_API_BASE_URL` empty).

## Production smoke test

Start production-style stack:
```bash
make prod-up
```

If your `docker-compose.prod.yml` maps proxy to default ports:
```bash
curl -i http://localhost/healthz
curl -i http://localhost/readyz
```

If proxy is mapped to custom host port (for example `8080:80`), use that port:
```bash
PORT=8080
curl -i "http://localhost:${PORT}/healthz"
curl -i "http://localhost:${PORT}/readyz"
```

## License

License: AGPL-3.0

This project is licensed under the GNU Affero General Public License v3.0. See `LICENSE`.

## Contributor note

- Use `prisma migrate dev` only when changing schema; otherwise use `prisma migrate deploy` (the default in Docker).
