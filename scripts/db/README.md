# Database Backup/Restore Scripts

These scripts run `pg_dump`/`psql` inside the docker compose `postgres` service, so you do not need local `psql` tooling installed.

## Requirements

- Docker with `docker compose`
- Repo root `.env` must define:
  - `POSTGRES_DB`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
- Optional compose overrides in `.env`:
  - `COMPOSE_FILE`
  - `COMPOSE_PROJECT_NAME` (or `COMPOSE_PROJECT`)

## Backup

`backup.sh` writes a plain SQL dump (schema + data) and compresses it with gzip.

```bash
scripts/db/backup.sh
```

Default output file:

```text
backups/loramapr-YYYYmmdd-HHMMSS.sql.gz
```

Custom output path:

```bash
scripts/db/backup.sh backups/my-backup.sql.gz
```

On success, it prints the backup filename.

Retention (default keep last 14 timestamped backups):

```bash
BACKUP_RETENTION=14 scripts/db/backup.sh
```

## Restore

Basic restore (stops app service first, restores DB, then starts app service again):

```bash
scripts/db/restore.sh backups/loramapr-20260216-103000.sql.gz
```

Restore and reset schema first:

```bash
scripts/db/restore.sh --drop-first backups/loramapr-20260216-103000.sql.gz
```

Advanced restore without stopping API service:

```bash
scripts/db/restore.sh --no-stop-api backups/loramapr-20260216-103000.sql.gz
```

Restore prompts for confirmation by default. To skip prompts in automation:

```bash
CONFIRM_RESTORE=1 scripts/db/restore.sh backups/loramapr-20260216-103000.sql.gz
```

## systemd (Daily Backup at 03:15)

1. Copy unit files:

```bash
sudo cp scripts/db/systemd/loramapr-db-backup.service /etc/systemd/system/
sudo cp scripts/db/systemd/loramapr-db-backup.timer /etc/systemd/system/
```

2. Create `/etc/loramapr/db-backup.env`:

```bash
sudo mkdir -p /etc/loramapr
sudo tee /etc/loramapr/db-backup.env >/dev/null <<'EOF'
POSTGRES_DB=loramapr
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
# Optional overrides:
# COMPOSE_FILE=/opt/loramapr/docker-compose.yml
# COMPOSE_PROJECT_NAME=loramapr
# BACKUP_RETENTION=14
EOF
```

3. Reload systemd and enable timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now loramapr-db-backup.timer
```

4. Verify schedule/logs:

```bash
systemctl list-timers --all | grep loramapr-db-backup
journalctl -u loramapr-db-backup.service -f
```

## Notes

- `restore.sh` attempts to stop/start `api` service; if not present, it falls back to `backend`.
- `--drop-first` drops and recreates `public` schema before import.
