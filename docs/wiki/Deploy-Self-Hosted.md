# Deploy (Self-Hosted)

This page documents the production-style compose deployment in `docker-compose.prod.yml`.

## What this deploys

- `postgres` (internal only, no host port exposure)
- `api` (internal only, healthchecked via `/readyz`)
- `web` (frontend production build served by nginx, internal only)
- `reverse-proxy` (Caddy, public entrypoint on `80/443`)

Only the reverse proxy publishes host ports.

## Prerequisites

- Docker Engine with `docker compose`
- A checked-out repo on your server
- Root `.env` configured (`cp .env.example .env`)

## Minimal setup

1. Create/edit env:

```bash
cp .env.example .env
```

2. Copy proxy config template:

```bash
cp deploy/Caddyfile.example deploy/Caddyfile
```

3. Choose routing mode in `deploy/Caddyfile`:

- Local/VPS HTTP: keep `:80 { ... }` block and keep `auto_https off`
- Real domain HTTPS: set `yourdomain.com { ... }`, then remove/comment `auto_https off`

4. Start stack:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

On API container startup, migrations run automatically:

1. wait for DB connectivity,
2. run `prisma migrate deploy`,
3. start the Nest server.

## DNS note (for real HTTPS mode)

Before enabling the domain block, point DNS `A`/`AAAA` records for your domain to your server IP.
Caddy can only obtain and renew certificates when the domain resolves publicly to this host.

## Verify

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs reverse-proxy -n 200 --no-log-prefix
docker compose -f docker-compose.prod.yml logs api -n 200 --no-log-prefix
curl -i http://localhost/api/healthz
curl -i http://localhost/api/readyz
```

Expected:

- `curl http://localhost/api/healthz` returns `200` if API process is running.
- `curl http://localhost/api/readyz` returns `200` when DB is reachable.
- Browser app is served from `http://<server-ip-or-domain>/`.
- API is reachable behind proxy at `/api/*`.

## Health endpoints

- `/api/healthz`: liveness only, no DB probe.
- `/api/readyz`: readiness with DB probe (`SELECT 1`), returns `503` when not ready.

## Diagnose "not ready"

If `/api/readyz` returns `503`, check API and Postgres logs:

```bash
docker compose -f docker-compose.prod.yml logs api -n 200 --no-log-prefix
docker compose -f docker-compose.prod.yml logs postgres -n 200 --no-log-prefix
```

Common indicators:

- API stuck at DB wait (`[api-entrypoint] Waiting for database availability...`)
- migration failure (`[api-entrypoint] Running prisma migrate deploy...` followed by Prisma errors)
- Postgres readiness failures (`pg_isready`/auth/network errors)

## Production smoke test

Use this quick checklist after each deployment:

1. Open the UI in browser (`http://<server-ip-or-domain>/`) and confirm the app shell loads.
2. Hit readiness through the proxy and confirm success:

```bash
curl -i http://<server-ip-or-domain>/api/readyz
```

3. Create a session from the UI (Start Session action) and verify it appears in the sessions panel.
4. Open the devices list in the UI and confirm devices are returned.

## Related files

- `docker-compose.prod.yml`
- `deploy/Caddyfile.example`
- `deploy/Caddyfile`

## Related pages

- [Quickstart](./Quickstart.md)
- [Backup-Restore](./Backup-Restore.md)
- [API-Keys-and-Scopes](./API-Keys-and-Scopes.md)
