# Backup and Restore Runbook

This document covers local development backups, self-hosted production backups with systemd, and recovery options.

## Dev Quick Commands

From repo root:

```bash
# Create backup (default: backups/loramapr-YYYYmmdd-HHMMSS.sql.gz)
scripts/db/backup.sh

# Create backup with explicit retention for this run
BACKUP_RETENTION=14 scripts/db/backup.sh

# Restore from backup (interactive confirmation)
scripts/db/restore.sh backups/loramapr-20260216-031500.sql.gz

# Restore and reset public schema first (prompts for RESTORE + DROP)
scripts/db/restore.sh --drop-first backups/loramapr-20260216-031500.sql.gz
```

## Self-Hosted Production Backup (Timer)

1. Deploy repo/scripts under `/opt/loramapr` on the host.
2. Install units:

```bash
sudo cp /opt/loramapr/scripts/db/systemd/loramapr-db-backup.service /etc/systemd/system/
sudo cp /opt/loramapr/scripts/db/systemd/loramapr-db-backup.timer /etc/systemd/system/
```

3. Create `/etc/loramapr/db-backup.env`:

```bash
sudo mkdir -p /etc/loramapr
sudo tee /etc/loramapr/db-backup.env >/dev/null <<'EOF'
POSTGRES_DB=loramapr
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change-me
# Optional:
# COMPOSE_FILE=/opt/loramapr/docker-compose.yml
# COMPOSE_PROJECT_NAME=loramapr
# BACKUP_RETENTION=14
EOF
```

4. Enable daily timer (03:15):

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now loramapr-db-backup.timer
```

5. Verify:

```bash
systemctl list-timers --all | grep loramapr-db-backup
sudo journalctl -u loramapr-db-backup.service -n 100 --no-pager
```

## Restore Procedure (In-Place)

Use this when restoring on the same host/environment.

1. Confirm backup file exists and is correct for target environment.
2. Run restore:

```bash
scripts/db/restore.sh backups/loramapr-20260216-031500.sql.gz
```

3. If full DB rewind is required, use schema reset:

```bash
scripts/db/restore.sh --drop-first backups/loramapr-20260216-031500.sql.gz
```

4. Do not use `--no-stop-api` unless you explicitly accept write-race risk during restore.

## Safer Restore: New Host Then Cutover

Preferred for production incidents:

1. Provision a new host with same Docker/Compose + app version.
2. Copy backup file to new host.
3. Restore backup on new host.
4. Run verification checklist below on new host.
5. Cut over by switching DNS/load balancer/reverse proxy to new host.
6. Keep old host read-only or offline until confidence window passes.

This approach reduces downtime and gives rollback by reverting traffic to old host.

## Post-Restore Verification Checklist

Run these after restore:

1. Containers healthy:

```bash
docker compose ps
```

2. Readiness endpoint:

```bash
curl -i http://localhost:3000/readyz
```

Expected: HTTP `200`.

3. Sample data queries:

```bash
# List devices
curl -s -H "X-API-Key: $QUERY_API_KEY" "http://localhost:3000/api/devices?limit=20" | jq .

# List recent sessions
curl -s -H "X-API-Key: $QUERY_API_KEY" "http://localhost:3000/api/sessions?limit=20" | jq .
```

4. Prisma migration state (if Prisma CLI is available):

```bash
npx prisma migrate status
```

## Security Notes

- Backup files include sensitive historical location data and operational metadata.
- Store backups in restricted paths and lock down file permissions (least privilege).
- Avoid world-readable paths or sharing backups in plaintext channels.
- Encrypt backups at rest and in transit when copied off-host.
