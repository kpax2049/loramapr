# Home Session Agent (systemd)

This guide shows how to run `scripts/home-session-agent.ts` as a systemd service.

## Example service file
Create `/etc/systemd/system/loramapr-home-session-agent.service`:
```ini
[Unit]
Description=LoraMapr Home Session Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/loramapr
EnvironmentFile=/opt/loramapr/.env.home-agent
ExecStart=/usr/bin/node /opt/loramapr/dist/scripts/home-session-agent.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Environment file
Create `/opt/loramapr/.env.home-agent`:
```ini
# Required
API_BASE_URL=http://localhost:3000
INGEST_API_KEY=your_ingest_key
DEVICE_UIDS=dev-1,dev-2
HOME_LAT=37.7749
HOME_LON=-122.4194

# Optional
POLL_INTERVAL_MS=5000
RADIUS_METERS=20
MIN_OUTSIDE_SECONDS=30
MIN_INSIDE_SECONDS=120
```

## Notes
- Ensure the compiled script exists at `dist/scripts/home-session-agent.js`.
- If running from source instead, use `ts-node` in `ExecStart` and ensure dependencies are installed.

## Enable and manage the service
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now loramapr-home-session-agent
sudo systemctl status loramapr-home-session-agent
```

## View logs
```bash
journalctl -u loramapr-home-session-agent -f
journalctl -u loramapr-home-session-agent --since "1 hour ago"
```
