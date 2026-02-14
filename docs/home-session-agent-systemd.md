# Home Session Agent on Raspberry Pi (systemd)

This guide shows how to run `scripts/home-session-agent.ts` as an always-on service on your home Raspberry Pi.

The agent is a separate process from the backend. It polls backend APIs with an `INGEST` key, evaluates home geofence transitions per device, starts/stops sessions, and writes decision audit events.

## Deployment modes

Choose one of these modes:

- Mode A (`ts-node` on Pi): simplest, but requires npm install on Pi.
- Mode B (precompiled JS, recommended for Pi Zero 2 W): build on stronger machine, copy JS to Pi, run with plain `node`.

For low-memory devices (Pi Zero class), Mode B is strongly recommended.

## How it works (important)

- Geofence config (`enabled`, `homeLat`, `homeLon`, `radiusMeters`, `minOutsideSeconds`, `minInsideSeconds`) is stored in backend DB and edited from UI.
- The agent reads that config from backend on every poll.
- You do not set geofence coordinates in the service env file.
- UI config changes apply automatically on the next poll (no service restart required).

## Prerequisites

- Raspberry Pi with Node.js/npm installed.
- Repo checked out on Pi (for example `/home/kpax/loramapr`) for Mode A.
- Dependencies installed in repo root for Mode A (`ts-node` is needed because the service runs TypeScript source).
- For Mode B, Pi only needs Node runtime and copied JS artifact.
- Backend reachable from Pi.
- `INGEST` API key.
- Correct `deviceUid` values (not display names), comma-separated.

If you already have only `/opt/loramapr/pi-forwarder`, that is not enough for Mode A. The forwarder folder does not include `scripts/home-session-agent.ts`.

## 1) Install/update code on Pi

```bash
sudo mkdir -p /opt/loramapr
sudo chown -R "$USER":"$USER" /opt/loramapr
cd /opt/loramapr

# If first time:
git clone <your-repo-url> .

# If already cloned:
git pull

npm install --no-audit --no-fund
```

Notes:

- This service uses `node_modules/.bin/ts-node`, which comes from devDependencies.
- If install fails due to network flakiness, retry and/or tune npm retries.

## 2) Create env file

Create `/etc/loramapr/home-session-agent.env`:

```ini
# Required
API_BASE_URL=http://192.168.1.50:3000
INGEST_API_KEY=replace_with_ingest_key
DEVICE_UIDS=e616744a,another-device-uid

# Optional
POLL_INTERVAL_MS=5000
STALE_SECONDS=180
```

Guidance:

- Use `localhost` only if backend runs on this same Pi host.
- Use backend LAN/WAN URL if backend runs elsewhere (for example AWS).
- `STALE_SECONDS=180` is a safer starting point when position updates are around once per minute.
- Replace placeholders with real values. `http://<your-backend-host>:3000` is invalid and will crash with `ERR_INVALID_URL`.
- Keep env file plain ASCII. Smart quotes or malformed lines can break parsing and corrupt `DEVICE_UIDS`.

Validate env file formatting:

```bash
sudo sed -n 'l' /etc/loramapr/home-session-agent.env
```

Each variable must appear on one clean line with no extra quote characters.

## 3) Create systemd unit

Create `/etc/systemd/system/loramapr-home-session-agent.service`:

```ini
[Unit]
Description=LoraMapr Home Session Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/opt/loramapr
EnvironmentFile=/etc/loramapr/home-session-agent.env
ExecStart=/opt/loramapr/node_modules/.bin/ts-node scripts/home-session-agent.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Adjust `User`/`Group` to your actual Pi user (for example `kpax`).

## 4) Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now loramapr-home-session-agent
sudo systemctl status loramapr-home-session-agent
```

## 4b) Mode B (recommended for Pi Zero): precompile on another machine and run plain Node

Build artifact on a stronger dev machine:

```bash
cd /path/to/loramapr
rm -rf /tmp/home-agent-dist
npx tsc scripts/home-session-agent.ts src/common/geo/haversine.ts \
  --module commonjs \
  --target es2022 \
  --moduleResolution node \
  --esModuleInterop \
  --skipLibCheck \
  --outDir /tmp/home-agent-dist

tar -C /tmp -czf /tmp/home-agent-dist.tgz home-agent-dist
scp /tmp/home-agent-dist.tgz kpax@<pi-host>:/tmp/
```

Deploy on Pi:

```bash
sudo mkdir -p /opt/loramapr/home-agent
sudo tar -xzf /tmp/home-agent-dist.tgz -C /opt/loramapr/home-agent --strip-components=1
```

Override service to use plain Node runtime:

```bash
sudo mkdir -p /etc/systemd/system/loramapr-home-session-agent.service.d
sudo tee /etc/systemd/system/loramapr-home-session-agent.service.d/override.conf >/dev/null <<'EOF'
[Service]
WorkingDirectory=/opt/loramapr/home-agent
ExecStart=
ExecStart=/usr/bin/node /opt/loramapr/home-agent/scripts/home-session-agent.js
EOF

sudo systemctl daemon-reload
sudo systemctl restart loramapr-home-session-agent
```

Verify effective service config:

```bash
systemctl cat loramapr-home-session-agent
```

## 5) Verify logs

```bash
journalctl -u loramapr-home-session-agent -f
journalctl -u loramapr-home-session-agent --since "1 hour ago"
```

Expected log patterns:

- startup: `Starting home session agent for N devices`
- transitions: `transition inside->outside ...` (or reverse)
- actions: `action=start ok ...`, `action=stop ok ...`
- audit post failures are logged with HTTP status if key/scope/url is wrong.

## 6) First functional test checklist

1. In UI, select device and save Auto Session config with valid home coordinates.
2. Confirm events/positions are arriving for that device.
3. Move outside geofence long enough to exceed `minOutsideSeconds`.
4. Check logs for `action=start ok`.
5. Return inside long enough to exceed `minInsideSeconds`.
6. Check logs for `action=stop ok`.
7. In UI status, verify latest `Agent: last decision ...`.

## Troubleshooting

### Service does not start

- Symptom: `status=217/USER` or credential error.
  - Fix: set correct `User`/`Group` in unit file.
- Symptom: `.../ts-node: No such file or directory`.
  - Fix: run `npm install` in `/opt/loramapr`.
- Symptom: `TypeError: Failed to parse URL ... <your-backend-host> ...`.
  - Fix: set real `API_BASE_URL` in env file (no angle brackets).
- Symptom: repeated restarts with `status=203/EXEC`.
  - Fix: validate `ExecStart` path exists (`ts-node` or `node` target script).

### No auto sessions created, but points are visible

- Check `DEVICE_UIDS` matches exact backend `deviceUid` (not display name).
- Confirm service logs show per-device transitions.
- Verify `INGEST_API_KEY` is valid and `API_BASE_URL` points to the same backend the UI is using.
- Verify auto-session is enabled and has `homeLat/homeLon`.
- Verify `DEVICE_UIDS` are exact backend `deviceUid` values.

### Repeated `stale` decisions

- Device position cadence is slower than stale threshold.
- Increase `STALE_SECONDS` and restart the service:

```bash
sudo systemctl restart loramapr-home-session-agent
```

### `DEVICE_UIDS` appears garbled in logs

If logs show weird UIDs containing quote characters or parts of other env vars (for example `POLL_INTERVAL_MS=...` inside UID), your env file is malformed.

Fix:

- Recreate `/etc/loramapr/home-session-agent.env` from scratch via heredoc.
- Validate with `sed -n 'l'`.
- Restart service.

### npm install on Pi gets `Killed` or repeatedly fails

This often indicates memory pressure (OOM), especially on Pi Zero class devices.

Use Mode B (precompiled JS) to avoid npm install on Pi.

### SSH disconnects during long setup commands

Use persistent shell session:

```bash
ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=10 kpax@<pi-host>
tmux new -s home-agent
```

### Config changes in UI do not seem applied

- Agent polls backend config; no restart needed for geofence parameter changes.
- Verify service can reach backend and logs are live.
- If changed runtime env vars (key/url/device list), restart service.

## Useful commands

```bash
sudo systemctl restart loramapr-home-session-agent
sudo systemctl stop loramapr-home-session-agent
sudo systemctl disable loramapr-home-session-agent
journalctl -u loramapr-home-session-agent -f
journalctl -u loramapr-home-session-agent -n 200 --no-pager
```
