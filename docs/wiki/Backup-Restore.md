# Backup and Restore

This wiki page summarizes the repo backup/restore tooling in `scripts/db/`.
It is based on:

- `scripts/db/backup.sh`
- `scripts/db/restore.sh`
- `scripts/db/README.md`
- `docs/backup-restore.md`

## Script model

- Uses docker compose service `postgres` for `pg_dump`/`psql` via `docker compose exec`
- Does not require local `psql` install
- Loads DB credentials from repo-root `.env`

Required env in `.env`:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

Optional compose context env:

- `COMPOSE_FILE`
- `COMPOSE_PROJECT_NAME` (or `COMPOSE_PROJECT`)

## Quick backup examples

```bash
# Default output: backups/loramapr-YYYYmmdd-HHMMSS.sql.gz
scripts/db/backup.sh

# Custom output file
scripts/db/backup.sh backups/my-backup.sql.gz

# Keep only last 14 timestamped backups
BACKUP_RETENTION=14 scripts/db/backup.sh
```

Notes:

- Backup format is plain SQL compressed with gzip (`.sql.gz`)
- Includes schema + data
- Script exits non-zero on failure

## Quick restore examples

```bash
# Interactive restore (prompts for confirmation)
scripts/db/restore.sh backups/loramapr-20260216-103000.sql.gz

# Restore after dropping/recreating public schema
scripts/db/restore.sh --drop-first backups/loramapr-20260216-103000.sql.gz

# Advanced: skip stopping API service (write-race risk)
scripts/db/restore.sh --no-stop-api backups/loramapr-20260216-103000.sql.gz
```

Restore safety behavior:

- Refuses missing/non-matching extension files (must be `.sql` or `.sql.gz`)
- Prints target DB and container before running
- Requires typing `RESTORE` unless `CONFIRM_RESTORE=1`
- `--drop-first` requires additional `DROP` confirmation
- Stops app service before restore (tries `api`, falls back to `backend`) unless `--no-stop-api`

## Retention

Retention is implemented in `backup.sh`:

- env `BACKUP_RETENTION` (default `14`)
- prunes oldest timestamped `backups/loramapr-*.sql*` files beyond retention count

Example:

```bash
BACKUP_RETENTION=30 scripts/db/backup.sh
```

## systemd daily backup timer

Included unit files:

- `scripts/db/systemd/loramapr-db-backup.service`
- `scripts/db/systemd/loramapr-db-backup.timer`

Timer schedule:

- daily at `03:15` (`OnCalendar=*-*-* 03:15:00`)
- persistent catch-up enabled (`Persistent=true`)

Install example:

```bash
sudo cp scripts/db/systemd/loramapr-db-backup.service /etc/systemd/system/
sudo cp scripts/db/systemd/loramapr-db-backup.timer /etc/systemd/system/

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

sudo systemctl daemon-reload
sudo systemctl enable --now loramapr-db-backup.timer
```

Verify timer:

```bash
systemctl list-timers --all | grep loramapr-db-backup
sudo journalctl -u loramapr-db-backup.service -n 100 --no-pager
```

## Restore verification checklist

After restore:

```bash
docker compose ps
curl -i http://localhost:3000/readyz
```

Optional data checks:

```bash
curl -s -H "X-API-Key: $QUERY_API_KEY" "http://localhost:3000/api/devices" | jq .
curl -s -H "X-API-Key: $QUERY_API_KEY" "http://localhost:3000/api/sessions" | jq .
```

If Prisma CLI is available:

```bash
npx prisma migrate status
```

## Security notes

- Backups contain sensitive location history and metadata.
- Store backups in restricted paths with least-privilege permissions.
- Use encryption at rest/in transit for off-host copies.
- Avoid world-readable locations.

## Full runbook

For expanded operational guidance (including safer restore to new host then cutover), see:

- `docs/backup-restore.md`
