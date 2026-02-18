# Quickstart

## Prerequisites

- Node.js + npm
- Docker
- Docker Compose (`docker compose`)

## First Run (Backend + Frontend)

### 1) Install dependencies

```bash
npm install
npm --prefix frontend install
```

### 2) Create env files

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

Required variables for local contributor flow:

- Backend (`.env`)
  - `DATABASE_URL` (required by backend config validation)
- Frontend (`frontend/.env`)
  - `VITE_API_BASE_URL` (set to `http://localhost:3000` for local backend)

Commonly used backend variables from `.env.example`:

- `PORT` (default `3000`)
- `FRONTEND_ORIGIN` (default `http://localhost:5173`)

### 3) Start Postgres + run migrations

```bash
docker compose up -d postgres
npm run db:migrate
```

Schema-development migration command used in this repo:

```bash
npm run db:migrate:dev
```

Optional seed script present in repo:

```bash
npx ts-node scripts/seed-data.ts --db
```

### 4) Run backend + frontend

One command:

```bash
npm run dev:all
```

Or separate terminals:

```bash
npm run start:dev
```

```bash
npm --prefix frontend run dev
```

Open: `http://localhost:5173`

## Simulate a Walk (Optional)

Mint an ingest key:

```bash
npm run apikey:mint -- --scopes INGEST --label "dev ingest key"
```

Send synthetic measurements:

```bash
npm run simulate:walk -- --apiKey YOUR_KEY --deviceUid dev-1 --baseLat 37.77 --baseLon -122.43 --minutes 15 --intervalSec 5 --seed demo
```
