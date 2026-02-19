# Troubleshooting

This page covers common runtime issues and quick fixes using commands already used in this repo.

## Health endpoints and status endpoint (what each means)

- `GET /healthz`: liveness check only. Returns `200` with `{ "status": "ok" }` if the API process is running.
- `GET /readyz`: readiness check with a DB probe (`SELECT 1`). Returns `200` with `{ "status": "ready" }` when DB is reachable, otherwise `503` with `{ "status": "not_ready", "error": "..." }`.
- `GET /api/status`: operational status (version, DB latency, worker state, latest ingest info). Requires `X-API-Key` with `QUERY` scope.

Quick checks:

```bash
curl -i http://localhost:3000/healthz
curl -i http://localhost:3000/readyz
curl -i -H "X-API-Key: $QUERY_API_KEY" http://localhost:3000/api/status
```

## Correlate UI errors with backend logs using X-Request-Id

Where to find it in UI:

- Open the **Debug** tab in the right-side controls panel.
- In the **System status** panel, failed status calls show an `X-Request-Id`.
- In **Recent API calls**, each row may include `id: <requestId>`.

How to use it:

```bash
# Example: search backend container logs for one request ID
docker compose logs backend --since=30m --no-log-prefix | rg "req-12345"
```

If you run backend locally with `npm run start:dev`, search your terminal output for the same request id.

curl example that injects your own request id:

```bash
curl -i \
  -H "X-API-Key: $QUERY_API_KEY" \
  -H "X-Request-Id: req-troubleshoot-001" \
  http://localhost:3000/api/status
```

You should see `X-Request-Id: req-troubleshoot-001` in the response headers.  
If you omit the header, backend generates one and returns it in both response headers and error JSON bodies.

## 401 / 403 errors (API key or scope)

Symptoms:

- `401 Unauthorized` with messages like `Missing API key` or `Invalid API key`
- `403 Forbidden` with `Missing required API key scope`

Checks:

```bash
# basic health
curl -i http://localhost:3000/health

# test protected endpoint with QUERY key
curl -i -H "X-API-Key: $QUERY_API_KEY" \
  "http://localhost:3000/api/lorawan/events?limit=1"

# test ingest endpoint with INGEST key
curl -i -X POST "http://localhost:3000/api/meshtastic/event" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $INGEST_API_KEY" \
  -d '{"from":"debug-node","lat":37.77,"lon":-122.42,"packetId":"debug-1"}'
```

Fixes:

- Use `X-API-Key` header exactly (case-insensitive HTTP header, but name must match this key).
- Use a key with the correct scope:
- `INGEST` for ingest/agent endpoints
- `QUERY` for debug/admin endpoints
- Re-mint keys if needed:

```bash
npm run apikey:mint -- --scopes INGEST --label "ingest-client"
npm run apikey:mint -- --scopes QUERY --label "ops-ui"
```

## 400 invalid payload

Symptoms:

- `400 Bad Request`
- Validation errors for measurement/agent/Lorawan payloads

Checks:

```bash
# measurement payload validation (expects valid shape and one deviceUid per request)
curl -i -X POST "http://localhost:3000/api/measurements" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $INGEST_API_KEY" \
  -d '{"deviceUid":"dev-test","capturedAt":"2026-02-18T10:00:00.000Z","lat":37.77,"lon":-122.42}'
```

Fixes:

- Ensure timestamps are valid ISO strings.
- Ensure required fields exist and numeric fields are numbers.
- For batched `POST /api/measurements`, all items must share one `deviceUid`.
- For `GET /api/*` filters, do not send both `deviceId` and `sessionId` together where endpoint requires one-or-the-other.

## No points on map until refetch or interaction

Possible symptoms:

- UI loads but map appears empty until changing filter, moving map, or clicking fit control.

Checks:

```bash
# verify backend returns points for selected scope
curl -s "http://localhost:3000/api/measurements?deviceId=<DEVICE_ID>&limit=50" | jq .

# verify selected device latest status
curl -s "http://localhost:3000/api/devices/<DEVICE_ID>/latest" | jq .
```

Fixes:

- Use **Fit to data** in UI after switching device/session or mode.
- Ensure active filter scope matches data (`deviceId` vs `sessionId`).
- Confirm selected time range includes your points.
- If testing locally, restart frontend dev server after env changes:

```bash
npm --prefix frontend run dev
```

## Pi Forwarder serial port busy

Symptoms:

- Meshtastic CLI reports `Could not exclusively lock port ... Resource temporarily unavailable`

Checks on Pi host:

```bash
lsof /dev/ttyACM0
ls -l /dev/serial/by-id/
sudo journalctl -u loramapr-pi-forwarder -n 200 --no-pager
```

Fixes:

- Stop conflicting service/process using the same serial port (for example old logger service):

```bash
sudo systemctl stop meshtastic-logger.service
sudo systemctl disable meshtastic-logger.service
```

- Prefer stable serial path in env (`/dev/serial/by-id/...`) instead of transient device names.
- Restart forwarder service after fixing lock conflict:

```bash
sudo systemctl restart loramapr-pi-forwarder
```

## DB connectivity errors

Symptoms:

- backend startup failures
- `readyz` returns `503`
- Prisma connection errors

Checks:

```bash
docker compose ps
docker compose logs postgres -n 200 --no-log-prefix
docker compose logs backend -n 200 --no-log-prefix
curl -i http://localhost:3000/readyz
```

Fixes:

- Ensure Postgres container is healthy and reachable in compose network.
- Ensure `.env` has valid `DATABASE_URL` for containerized backend (`@postgres:5432` host in compose).
- Re-run migration service and restart stack if schema/app drift exists:

```bash
docker compose up -d --build
docker compose logs migrate -n 100 --no-log-prefix
```

If you suspect local dev DB drift:

```bash
npx prisma migrate status
```

## P1001 on docker compose up (localhost vs postgres host)

Symptoms:

- `migrate` service exits with code 1 during `docker compose up -d`
- Prisma error: `P1001: Can't reach database server at localhost:5432`

Why this happens:

- Inside docker compose, `localhost` points to the container itself, not the Postgres service container.

Checks:

```bash
docker compose logs migrate --no-log-prefix --tail=200
grep '^DATABASE_URL=' .env
```

Fixes:

- For docker compose backend/migrate, use service host `postgres`:

```bash
# macOS
sed -i '' 's#^DATABASE_URL=.*#DATABASE_URL=postgresql://postgres:postgres@postgres:5432/loramapr#' .env

docker compose down
docker compose up -d --build
docker compose logs migrate --no-log-prefix --tail=80
```

- For host-run backend (`npm run start:dev`), use `localhost` instead:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/loramapr
```
