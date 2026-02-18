# Deploy (Self-Hosted)

This page documents the current best self-hosted deployment path for this repo.
It reflects what is implemented now: backend + Postgres via `docker compose`, with frontend typically served separately.

## What this deploys today

- `postgres` service (PostgreSQL 16)
- `migrate` service (runs `prisma migrate deploy` once)
- `backend` service (Nest API on port `3000`)

Defined in `docker-compose.yml`.

## Prerequisites

- Docker Engine with `docker compose`
- Git + repo checkout on target host
- Host ports available:
- `3000` (backend API)
- `5432` (Postgres, currently mapped in compose)

## 1) Prepare environment

From repo root on host:

```bash
cp .env.example .env
```

Minimum required env (validated by backend):

- `DATABASE_URL`

Commonly used env in this repo:

- `PORT` (default `3000`)
- `FRONTEND_ORIGIN` (or `CORS_ORIGIN`) for browser access/CORS

For compose in this repo, `DATABASE_URL` should target service host `postgres`, for example:

```dotenv
DATABASE_URL=postgres://postgres:postgres@postgres:5432/loramapr
PORT=3000
FRONTEND_ORIGIN=https://your-frontend.example.com
```

## 2) Start stack (prod-like compose run)

```bash
docker compose up -d --build
```

This starts `postgres`, runs `migrate`, then starts `backend` (per compose dependencies).

## 3) Verify deployment

```bash
docker compose ps
docker compose logs backend -n 200 --no-log-prefix
curl -i http://localhost:3000/health
curl -i http://localhost:3000/readyz
```

Expected:

- `health` returns `200 {"status":"ok"}`
- `readyz` returns `200` when DB is reachable

## Ports and network notes

- API is exposed on host `:3000` (`backend` -> `3000:3000`)
- Postgres is exposed on host `:5432` (`postgres` -> `5432:5432`)

For internet-facing deployments, do not leave Postgres (`5432`) publicly reachable.
Restrict with firewall/security groups or remove host port mapping if not needed externally.

## Frontend serving (current repo model)

The compose file here does not include a frontend web server container.

Typical options:

- Dev/LAN: run Vite from `frontend/` (`npm --prefix frontend run dev`)
- Production-style: build frontend (`npm --prefix frontend run build`) and serve `frontend/dist` via your web server/CDN

Set `VITE_API_BASE_URL` in frontend env to the public API URL.

## Reverse proxy and TLS

No reverse-proxy config is bundled in this repo today.
In cloud/public deployments, place a reverse proxy (Nginx/Caddy/Traefik/etc.) in front of backend:

- terminate HTTPS/TLS at proxy
- route API traffic to backend `:3000`
- optionally serve frontend static assets from the same domain

Also set `FRONTEND_ORIGIN` (or `CORS_ORIGIN`) to your frontend origin(s) so browser calls are allowed.
If multiple origins are needed, use comma-separated values.

## Updates

When updating:

```bash
git pull
docker compose up -d --build
docker compose logs migrate -n 100 --no-log-prefix
docker compose logs backend -n 100 --no-log-prefix
```

## Related pages

- [Quickstart](./Quickstart.md)
- [Backup-Restore](./Backup-Restore.md)
- [API-Keys-and-Scopes](./API-Keys-and-Scopes.md)
