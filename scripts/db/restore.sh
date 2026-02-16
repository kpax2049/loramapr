#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'EOF'
Usage:
  scripts/db/restore.sh [--drop-first] [--no-stop-api] BACKUP_FILE

Options:
  --drop-first   Drop and recreate public schema before restore.
  --no-stop-api  Do not stop/restart api service around restore.
EOF
}

DROP_FIRST=false
NO_STOP_API=false
BACKUP_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --drop-first)
      DROP_FIRST=true
      ;;
    --no-stop-api)
      NO_STOP_API=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      usage >&2
      die "Unknown option: $1"
      ;;
    *)
      if [[ -n "$BACKUP_FILE" ]]; then
        usage >&2
        die "Only one BACKUP_FILE may be provided"
      fi
      BACKUP_FILE="$1"
      ;;
  esac
  shift
done

[[ -n "$BACKUP_FILE" ]] || {
  usage >&2
  die "BACKUP_FILE is required"
}

if [[ "$BACKUP_FILE" != /* ]]; then
  BACKUP_FILE="$REPO_ROOT/$BACKUP_FILE"
fi
[[ -f "$BACKUP_FILE" ]] || die "Backup file not found: $BACKUP_FILE"

init_db_common

API_SERVICE=""
API_WAS_STOPPED=false

maybe_start_api() {
  if [[ "$NO_STOP_API" == "false" && "$API_WAS_STOPPED" == "true" && -n "$API_SERVICE" ]]; then
    compose_cmd start "$API_SERVICE" >/dev/null
  fi
}
trap maybe_start_api EXIT

if [[ "$NO_STOP_API" == "false" ]]; then
  API_SERVICE="$(resolve_api_service)"
  if [[ -n "$API_SERVICE" ]]; then
    compose_cmd stop "$API_SERVICE" >/dev/null
    API_WAS_STOPPED=true
  else
    echo "WARN: No api/backend service found; continuing without stopping app writes" >&2
  fi
fi

if [[ "$DROP_FIRST" == "true" ]]; then
  compose_cmd exec -T \
    -e "PGPASSWORD=$POSTGRES_PASSWORD" \
    postgres \
    psql \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --set ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
SQL
fi

if [[ "$BACKUP_FILE" == *.gz ]]; then
  gzip -dc "$BACKUP_FILE" | compose_cmd exec -T \
    -e "PGPASSWORD=$POSTGRES_PASSWORD" \
    postgres \
    psql \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --set ON_ERROR_STOP=1
else
  cat "$BACKUP_FILE" | compose_cmd exec -T \
    -e "PGPASSWORD=$POSTGRES_PASSWORD" \
    postgres \
    psql \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --set ON_ERROR_STOP=1
fi

echo "Restore completed from $BACKUP_FILE"
