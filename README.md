# LoRaMapr

> ⚠️ **Active development notice**  
> This project is under active development and is **not** a complete, production-ready app yet.  
> The goal is to reach a more or less production‑ready **v1.0.0**; until then, expect breaking changes and evolving features.

LoRaMapr is a hardware-backed mapping and visualization project focused on collecting, storing, and displaying LoRa-based field data on an interactive map.

The project combines portable LoRa devices (for example GPS-enabled trackers and mesh nodes) with a web backend and frontend to ingest telemetry such as location, signal strength, and timestamps, then render that data in a structured, explorable map UI.

The primary goals are:
- Field data collection using LoRa / mesh-capable devices
- Reliable ingestion and storage of time-series + geospatial data
- Clear visualization of coverage, paths, and nodes on a map
- A modular architecture that allows future expansion (users, auth, analytics, additional sensors)

This repository serves as the main codebase for the backend and web application powering the LoRaMapr system.

## Tech stack

- Node.js + TypeScript
- NestJS (HTTP API backend)
- RxJS, class-validator, class-transformer

## Quickstart (first-time users)

```bash
cp .env.example .env
docker compose up --build
```

## What to expect

- Backend listens on `http://localhost:3000`
- Postgres runs as the `postgres` service
- Migrations are applied automatically on startup

## Health check

```bash
GET http://localhost:3000/health
```

## Running locally (contributors)

```bash
npm install
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

## Contributor note

- Use `prisma migrate dev` only when changing schema; otherwise use `prisma migrate deploy` (the default in Docker).
