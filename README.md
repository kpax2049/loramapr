# LoRaMapr

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

## Running locally

```bash
npm install
npm run start:dev
```

## Docker dev workflow (backend)

1) Start Postgres:
```bash
docker compose up -d postgres
```

2) Run migrations:
```bash
npm run db:migrate
```

3) Start Nest:
```bash
npm run start:dev
```

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
