# Release v0.9.15 - Prod compose + reverse proxy baseline

## Added
- Added `docker-compose.prod.yml` as a production-style deployment stack with `postgres`, `api`, `web`, and `reverse-proxy` services on an internal Docker network.
- Added Caddy proxy templates at `deploy/Caddyfile.example` and `deploy/Caddyfile` supporting:
  - local/VPS HTTP mode (`:80`),
  - real-domain automatic HTTPS mode,
  - compression and baseline security headers,
  - `/api/*` routing to backend and all other paths to frontend.
- Added production stack command shortcuts in local tooling:
  - `make prod-up`, `make prod-down`, `make prod-logs`
  - `./bin/loramapr prod-up|prod-down|prod-logs`

## Changed
- Hardened backend CORS in production: `CORS_ORIGINS` is now a strict allowlist and empty production allowlist denies cross-origin browser requests; development remains permissive.
- Updated `.env.example` with explicit `CORS_ORIGINS` examples (`http://localhost:5173`, `https://yourdomain.com`).
- Updated `docs/wiki/Deploy-Self-Hosted.md` with Caddy copy/setup flow, DNS note for HTTPS, and production smoke-test checklist.

## Milestone
- Prod-like compose now works both locally and on a VPS with reverse proxy ingress and internal-only app/database service connectivity.

## Acceptance
- Production stack starts via:
  - `docker compose -f docker-compose.prod.yml up -d --build`
- Deployment can be validated by:
  - loading UI through reverse proxy,
  - checking `/api/readyz`,
  - creating a session,
  - confirming devices list availability.
