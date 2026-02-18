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

`make up` starts `postgres`, `migrate`, `backend`, and `frontend`.

```bash
make up
```

### 5) Open app

- Frontend UI: `http://localhost:5173`
- Backend API: `http://localhost:3000`
- Health: `http://localhost:3000/health`
- Readiness: `http://localhost:3000/readyz`

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
