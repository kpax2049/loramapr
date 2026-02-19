# Quickstart

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

### 4) Start stack

`make up` starts `postgres`, `backend`, and `frontend`.
On backend startup, the API container now:

1. waits for DB readiness,
2. runs `prisma migrate deploy`,
3. then starts Nest.

```bash
make up
```

### 5) Open app

- Frontend UI: `http://localhost:5173`
- Backend API: `http://localhost:3000`
- Health: `http://localhost:3000/health`
- Healthz: `http://localhost:3000/healthz`
- Readiness: `http://localhost:3000/readyz`

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
