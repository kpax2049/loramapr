#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'EOF'
Usage:
  scripts/db/backup.sh [OUTPUT_FILE]

Description:
  Creates a compressed plain-SQL backup (schema + data) from the docker compose
  postgres service using pg_dump inside the container.

Default output:
  backups/loramapr-YYYYmmdd-HHMMSS.sql.gz
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 1 ]]; then
  usage >&2
  exit 1
fi

init_db_common

BACKUP_DIR="$REPO_ROOT/backups"
mkdir -p "$BACKUP_DIR"

DEFAULT_NAME="loramapr-$(date +%Y%m%d-%H%M%S).sql.gz"
OUTPUT_FILE="${1:-$BACKUP_DIR/$DEFAULT_NAME}"
if [[ "$OUTPUT_FILE" != /* ]]; then
  OUTPUT_FILE="$REPO_ROOT/$OUTPUT_FILE"
fi

mkdir -p "$(dirname "$OUTPUT_FILE")"
TMP_FILE="${OUTPUT_FILE}.tmp"
rm -f "$TMP_FILE"

if ! compose_cmd exec -T \
  -e "PGPASSWORD=$POSTGRES_PASSWORD" \
  postgres \
  pg_dump \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --no-owner \
  --no-privileges \
  | gzip -c >"$TMP_FILE"; then
  rm -f "$TMP_FILE"
  die "Backup failed"
fi

mv "$TMP_FILE" "$OUTPUT_FILE"
echo "$OUTPUT_FILE"
