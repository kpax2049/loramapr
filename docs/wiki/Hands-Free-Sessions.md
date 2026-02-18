# Hands-Free Sessions

`Hands-Free Sessions` are driven by the home session agent (`scripts/home-session-agent.ts`).
The agent polls per-device config and latest position, applies a geofence state machine, then calls backend start/stop endpoints.

## Required backend endpoints

Agent runtime uses these endpoints with `X-API-Key` that has `INGEST` scope:

- `GET /api/agent/devices/:deviceUid/auto-session`
- `GET /api/agent/devices/:deviceUid/latest-position`
- `POST /api/agent/sessions/start`
- `POST /api/agent/sessions/stop`
- `POST /api/agent/decisions` (audit insert)

Config management from UI/tools uses QUERY-scope device endpoints:

- `GET /api/devices/:id/auto-session`
- `PUT /api/devices/:id/auto-session`

Audit read endpoint (QUERY scope):

- `GET /api/devices/:id/agent-decisions?limit=200`

## Auto-session config fields and defaults

Resolved config returned by `GET /api/agent/devices/:deviceUid/auto-session`:

```json
{
  "deviceUid": "...",
  "deviceId": "...",
  "enabled": false,
  "homeLat": null,
  "homeLon": null,
  "radiusMeters": null,
  "minOutsideSeconds": 30,
  "minInsideSeconds": 120
}
```

Defaults in current implementation:

- `enabled`: `false`
- `homeLat`, `homeLon`: `null`
- `radiusMeters`: `20` only when enabled and no explicit value; otherwise `null` when disabled
- `minOutsideSeconds`: `30`
- `minInsideSeconds`: `120`

Agent env defaults affecting behavior:

- `POLL_INTERVAL_MS=5000`
- `STALE_SECONDS=60`

## State machine behavior

For each `deviceUid` on each tick:

1. Load auto-session config.
2. If `enabled=false`:
- state becomes `disabled`
- no start/stop action
- decision `disabled` is posted only when transitioning into disabled mode
3. Load latest position.
4. Stale handling (no start/stop while stale):
- `capturedAt` missing, or lat/lon missing => stale (`reason=no_position`)
- invalid timestamp => stale (`reason=invalid_capturedAt`)
- `now - capturedAt > STALE_SECONDS` => stale (`reason=stale_position`)
5. If enabled but home coordinates are missing:
- state becomes `disabled` (`reason=missing_home_coordinates`)
- no start/stop action
6. Compute `distanceM` and `inside = distanceM <= radiusMeters`.
7. Transition logic:
- when inside/outside flips, `lastChangeAt` resets
- if outside for at least `minOutsideSeconds`, call `POST /api/agent/sessions/start`
- if inside for at least `minInsideSeconds`, call `POST /api/agent/sessions/stop`

Notes:

- The agent avoids repeated start/stop spam by tracking the last side it triggered for.
- It also does not post `noop` every tick.
- `startForDeviceUid` is idempotent for active sessions (returns existing active session if one already exists).

## Audit trail (AgentDecision)

Implemented:

- Agent writes decisions to `POST /api/agent/decisions` for:
  - `start`
  - `stop`
  - `stale`
  - `disabled`
- API consumers can read history via `GET /api/devices/:id/agent-decisions`.

UI status visibility:

- Implemented: Controls status row shows the latest decision (`Agent: last decision ...`) when QUERY key is available.
- Not implemented yet: dedicated full AgentDecision history panel in the UI.

## Test procedure (walk test)

1. Pick a device receiving measurements and note its `deviceUid`.
2. Configure auto-session for that device (`enabled=true`, `homeLat`, `homeLon`, radius, thresholds).
3. Run the agent with valid `INGEST` key and matching `DEVICE_UIDS`.
4. Move outside the configured radius and stay out longer than `minOutsideSeconds`.
5. Confirm:
- session starts (`POST /api/agent/sessions/start` effect)
- new agent decision `start`
6. Move back inside radius and stay in longer than `minInsideSeconds`.
7. Confirm:
- session stops (`POST /api/agent/sessions/stop` effect)
- new agent decision `stop`
8. Optionally stop movement until position is stale (`> STALE_SECONDS`) and confirm a `stale` decision appears.

Useful checks:

```bash
# Latest decisions
curl -s -H "X-API-Key: $QUERY_API_KEY" \
  "http://localhost:3000/api/devices/<deviceId>/agent-decisions?limit=20" | jq .

# Sessions for device
curl -s -H "X-API-Key: $QUERY_API_KEY" \
  "http://localhost:3000/api/sessions?deviceId=<deviceId>" | jq .
```

## Not implemented yet

- Persisting per-device agent in-memory state across agent restarts.
- Dedicated UI view for full agent decision history (API exists; latest decision is shown in status).
