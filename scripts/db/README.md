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

## Notes

- `restore.sh` attempts to stop/start `api` service; if not present, it falls back to `backend`.
- `--drop-first` drops and recreates `public` schema before import.
