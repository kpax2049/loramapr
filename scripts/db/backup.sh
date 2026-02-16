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

Optional env:
  BACKUP_RETENTION=14  Keep last N timestamped backups in backups/
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

BACKUP_RETENTION_RAW="${BACKUP_RETENTION:-14}"
[[ "$BACKUP_RETENTION_RAW" =~ ^[0-9]+$ ]] || die "BACKUP_RETENTION must be a non-negative integer"
BACKUP_RETENTION="$BACKUP_RETENTION_RAW"

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

if (( BACKUP_RETENTION > 0 )); then
  shopt -s nullglob
  CANDIDATES=("$BACKUP_DIR"/loramapr-*.sql "$BACKUP_DIR"/loramapr-*.sql.gz)
  shopt -u nullglob

  if (( ${#CANDIDATES[@]} > BACKUP_RETENTION )); then
    SORTED=()
    while IFS= read -r file; do
      SORTED+=("$file")
    done < <(printf '%s\n' "${CANDIDATES[@]}" | sort)

    DELETE_COUNT=$(( ${#SORTED[@]} - BACKUP_RETENTION ))
    for ((i = 0; i < DELETE_COUNT; i++)); do
      rm -f "${SORTED[$i]}"
    done
    echo "Pruned $DELETE_COUNT old backup(s); retention=$BACKUP_RETENTION" >&2
  fi
fi

echo "$OUTPUT_FILE"
