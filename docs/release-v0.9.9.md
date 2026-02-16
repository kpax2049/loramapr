# Release v0.9.9 - Backup & Restore Tooling

## Added
- Database backup script (`scripts/db/backup.sh`) producing timestamped compressed dumps under `backups/`.
- Database restore script (`scripts/db/restore.sh`) with safe defaults, optional `--drop-first`, and automatic API stop/start handling.
- Safety guardrails for restore: file validation, target DB visibility, and typed confirmations.
- Optional self-host automation: systemd service + timer for daily backups with configurable retention.
- Documentation for dev vs production workflows and post-restore verification (`docs/backup-restore.md`).
