# API Keys and Scopes

## Header names used in code

- `X-API-Key`: API key header used by `ApiKeyGuard` (read from `x-api-key` in Node headers)
- `X-Idempotency-Key`: optional idempotency header for `POST /api/meshtastic/event`
- `X-Confirm-Delete`: confirmation header required for destructive delete mode on some endpoints
- `x-downlink-apikey`: webhook credential header for `POST /api/lorawan/uplink` (TTS path)
- `Authorization: Basic ...`: alternate webhook credential for `POST /api/lorawan/uplink`

## Scopes in use

Available scopes in Prisma enum:

- `INGEST`
- `QUERY`

`ApiKeyGuard` behavior:

- Missing key -> `401 Missing API key`
- Invalid key -> `401 Invalid API key`
- Missing required scope -> `403 Missing required API key scope`
- If `ApiKeyGuard` is used and no explicit scope is set, default required scope is `INGEST`

## Where `INGEST` is required

These endpoints are intended for data ingest and agent automation clients, not browser UI:

- `POST /api/measurements`
- `POST /api/meshtastic/event`
- `GET /api/agent/devices/:deviceUid/latest-position`
- `GET /api/agent/devices/:deviceUid/auto-session`
- `POST /api/agent/sessions/start`
- `POST /api/agent/sessions/stop`
- `POST /api/agent/decisions`

## Where `QUERY` is required

These endpoints are read/admin/debug/export style operations:

- LoRaWAN debug APIs:
- `GET /api/lorawan/events`
- `GET /api/lorawan/events/:id`
- `GET /api/lorawan/summary`
- `POST /api/lorawan/events/:id/reprocess`
- `POST /api/lorawan/reprocess`
- Meshtastic debug/receiver APIs:
- `GET /api/meshtastic/events`
- `GET /api/meshtastic/events/:id`
- `GET /api/meshtastic/receivers`
- Device admin/agent config APIs:
- `PATCH /api/devices/:id`
- `DELETE /api/devices/:id`
- `GET /api/devices/:id/auto-session`
- `PUT /api/devices/:id/auto-session`
- `GET /api/devices/:id/agent-decisions`
- Session admin APIs:
- `PATCH /api/sessions/:id`
- `DELETE /api/sessions/:id`
- Gateway/receiver/export APIs:
- `GET /api/gateways`
- `GET /api/gateways/:gatewayId/stats`
- `GET /api/receivers`
- `GET /api/export/session/:sessionId.geojson`

## UI vs scope usage

Current frontend behavior (`frontend/src/api/endpoints.ts`):

- Core map/session data calls are currently made without `X-API-Key`:
- `/api/devices`, `/api/devices/:id`, `/api/devices/:id/latest`
- `/api/measurements`, `/api/tracks`, `/api/stats`, `/api/coverage/bins`
- `/api/sessions`, `/api/sessions/start`, `/api/sessions/stop`, `/api/sessions/:id`, `/api/sessions/:id/timeline`, `/api/sessions/:id/window`
- QUERY-protected UI features attach `X-API-Key` from `VITE_QUERY_API_KEY`:
- debug panels (`/api/lorawan/*`, `/api/meshtastic/events*`)
- gateway/receiver endpoints
- device/session admin mutations and auto-session config

Note: `OwnerGuard` is currently permissive (TODO auth), so several read endpoints are not API-key protected yet.

## Recommended practices

- Never embed `INGEST` keys in browser code or public frontend env files.
- Use `INGEST` keys only in trusted server/edge processes (forwarders, agents, webhook relays).
- Keep `QUERY` keys scoped to trusted operator UIs; avoid exposing them on public internet deployments.
- Rotate keys regularly and immediately on suspected leak.
- Mint distinct keys per component/use-case and label them clearly.
- For cloud hosting, require HTTPS/TLS end-to-end so keys are never sent over plaintext HTTP.

Useful key mint command:

```bash
npm run apikey:mint -- --scopes INGEST --label "pi-forwarder"
npm run apikey:mint -- --scopes QUERY --label "ops-ui"
```

## CORS notes (current implementation)

CORS is enabled in `src/main.ts` with:

- `origin`: `FRONTEND_ORIGIN` or `CORS_ORIGIN` (comma-separated), otherwise localhost regex fallback
- `credentials: true`
- `allowedHeaders`: `X-API-Key`, `Content-Type`
- `methods`: `GET`, `POST`, `PATCH`, `OPTIONS`

Implications for browser clients:

- Cross-origin `PUT`/`DELETE` requests are not currently listed in allowed methods.
- Cross-origin custom headers beyond the allowed list (for example `X-Confirm-Delete`, `X-Idempotency-Key`) are not currently listed.
- If you split frontend/backend across origins and need those operations from browser, update CORS config accordingly.

## Special case: LoRaWAN webhook auth

`POST /api/lorawan/uplink` does not use `X-API-Key` scopes.
It is protected by `LorawanWebhookGuard` and accepts one of:

- `x-downlink-apikey` matching `TTS_WEBHOOK_API_KEY`
- `Authorization: Basic ...` matching `TTS_WEBHOOK_BASIC_USER` / `TTS_WEBHOOK_BASIC_PASS`
