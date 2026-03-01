#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'EOF'
Usage:
  scripts/db/sanitize-device-sessions.sh \
    (--device-id UUID | --device-uid UID) \
    --target-lat LAT \
    --target-lon LON \
    [--dry-run] \
    [--no-rebuild-coverage]

Description:
  Finds all sessions for the given device, shifts all measurements in those sessions
  by a centroid delta so the session cluster is centered at (target-lat, target-lon),
  and rebuilds coverage bins for that device (unless --no-rebuild-coverage).

Notes:
  - This script updates your DB data in place.
  - Recommended workflow: run on a cloned/sanitized DB, not primary production data.
EOF
}

is_number() {
  local value="$1"
  [[ "$value" =~ ^-?[0-9]+([.][0-9]+)?$ ]]
}

is_uuid() {
  local value="$1"
  [[ "$value" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]
}

sql_literal() {
  local value="$1"
  value="${value//\'/\'\'}"
  printf "'%s'" "$value"
}

DEVICE_ID=""
DEVICE_UID=""
TARGET_LAT=""
TARGET_LON=""
DRY_RUN=false
REBUILD_COVERAGE=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device-id)
      [[ $# -ge 2 ]] || die "--device-id requires a value"
      DEVICE_ID="$2"
      shift 2
      ;;
    --device-uid)
      [[ $# -ge 2 ]] || die "--device-uid requires a value"
      DEVICE_UID="$2"
      shift 2
      ;;
    --target-lat)
      [[ $# -ge 2 ]] || die "--target-lat requires a value"
      TARGET_LAT="$2"
      shift 2
      ;;
    --target-lon)
      [[ $# -ge 2 ]] || die "--target-lon requires a value"
      TARGET_LON="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --no-rebuild-coverage)
      REBUILD_COVERAGE=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "Unknown argument: $1"
      ;;
  esac
done

if [[ -z "$DEVICE_ID" && -z "$DEVICE_UID" ]]; then
  usage >&2
  die "Provide --device-id or --device-uid"
fi

if [[ -n "$DEVICE_ID" && -n "$DEVICE_UID" ]]; then
  usage >&2
  die "Provide only one of --device-id or --device-uid"
fi

if [[ -n "$DEVICE_ID" ]]; then
  is_uuid "$DEVICE_ID" || die "--device-id must be a UUID"
fi

[[ -n "$TARGET_LAT" ]] || die "--target-lat is required"
[[ -n "$TARGET_LON" ]] || die "--target-lon is required"
is_number "$TARGET_LAT" || die "--target-lat must be numeric"
is_number "$TARGET_LON" || die "--target-lon must be numeric"

init_db_common

psql_exec() {
  compose_cmd exec -T \
    -e "PGPASSWORD=$POSTGRES_PASSWORD" \
    postgres \
    psql \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --set ON_ERROR_STOP=1 \
    "$@"
}

if [[ -n "$DEVICE_UID" ]]; then
  DEVICE_UID_SQL="$(sql_literal "$DEVICE_UID")"
  DEVICE_ID="$(psql_exec -tA -c \
    "SELECT \"id\" FROM \"Device\" WHERE \"deviceUid\" = ${DEVICE_UID_SQL} LIMIT 1;")"
  [[ -n "$DEVICE_ID" ]] || die "Device not found for uid: $DEVICE_UID"
fi

if [[ -z "$DEVICE_UID" ]]; then
  DEVICE_ID_SQL="$(sql_literal "$DEVICE_ID")"
  DEVICE_UID="$(psql_exec -tA -c \
    "SELECT \"deviceUid\" FROM \"Device\" WHERE \"id\" = ${DEVICE_ID_SQL}::uuid LIMIT 1;")"
  [[ -n "$DEVICE_UID" ]] || die "Device not found for id: $DEVICE_ID"
fi

DEVICE_ID_SQL="$(sql_literal "$DEVICE_ID")"

SESSION_COUNT="$(psql_exec -tA -c \
  "SELECT count(*) FROM \"Session\" WHERE \"deviceId\" = ${DEVICE_ID_SQL}::uuid;")"
[[ "$SESSION_COUNT" =~ ^[0-9]+$ ]] || die "Failed to read session count"
(( SESSION_COUNT > 0 )) || die "No sessions found for device $DEVICE_UID ($DEVICE_ID)"

MEASUREMENT_COUNT="$(psql_exec -tA -c \
  "SELECT count(*) FROM \"Measurement\" m
   WHERE m.\"sessionId\" IN (SELECT s.\"id\" FROM \"Session\" s WHERE s.\"deviceId\" = ${DEVICE_ID_SQL}::uuid);")"
[[ "$MEASUREMENT_COUNT" =~ ^[0-9]+$ ]] || die "Failed to read measurement count"
(( MEASUREMENT_COUNT > 0 )) || die "No session-bound measurements found for device $DEVICE_UID ($DEVICE_ID)"

CENTROID_RAW="$(psql_exec -tA -F '|' -c \
  "SELECT avg(m.\"lat\"), avg(m.\"lon\")
   FROM \"Measurement\" m
   WHERE m.\"sessionId\" IN (SELECT s.\"id\" FROM \"Session\" s WHERE s.\"deviceId\" = ${DEVICE_ID_SQL}::uuid);")"

SRC_LAT="$(awk -F'|' '{print $1}' <<<"$CENTROID_RAW" | tr -d '[:space:]')"
SRC_LON="$(awk -F'|' '{print $2}' <<<"$CENTROID_RAW" | tr -d '[:space:]')"
[[ -n "$SRC_LAT" && -n "$SRC_LON" ]] || die "Failed to compute source centroid"

DELTA_LAT="$(awk -v target="$TARGET_LAT" -v src="$SRC_LAT" 'BEGIN { printf "%.10f", target - src }')"
DELTA_LON="$(awk -v target="$TARGET_LON" -v src="$SRC_LON" 'BEGIN { printf "%.10f", target - src }')"

echo "Device: $DEVICE_UID ($DEVICE_ID)"
echo "Sessions: $SESSION_COUNT"
echo "Measurements to shift: $MEASUREMENT_COUNT"
echo "Source centroid: lat=$SRC_LAT lon=$SRC_LON"
echo "Target centroid: lat=$TARGET_LAT lon=$TARGET_LON"
echo "Applied delta:  lat=$DELTA_LAT lon=$DELTA_LON"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Dry-run only; no changes applied."
  exit 0
fi

UPDATED_COUNT="$(psql_exec -tA -c \
  "WITH updated AS (
        UPDATE \"Measurement\" m
        SET \"lat\" = m.\"lat\" + ${DELTA_LAT}::double precision,
            \"lon\" = m.\"lon\" + ${DELTA_LON}::double precision
        WHERE m.\"sessionId\" IN (
          SELECT s.\"id\"
          FROM \"Session\" s
          WHERE s.\"deviceId\" = ${DEVICE_ID_SQL}::uuid
        )
        RETURNING 1
      )
      SELECT count(*) FROM updated;")"

[[ "$UPDATED_COUNT" =~ ^[0-9]+$ ]] || die "Failed to update measurements"
echo "Updated measurements: $UPDATED_COUNT"

if [[ "$REBUILD_COVERAGE" == "true" ]]; then
  psql_exec -q -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null
  COVERAGE_COUNTS_RAW="$(psql_exec -tA -F '|' -c \
    "WITH deleted AS (
       DELETE FROM \"CoverageBin\"
       WHERE \"deviceId\" = ${DEVICE_ID_SQL}::uuid
       RETURNING 1
     ),
     inserted AS (
       INSERT INTO \"CoverageBin\" (
         \"id\",
         \"deviceId\", \"sessionId\", \"gatewayId\", \"day\", \"latBin\", \"lonBin\", \"count\",
         \"rssiAvg\", \"snrAvg\", \"rssiMin\", \"rssiMax\", \"snrMin\", \"snrMax\", \"updatedAt\"
       )
       SELECT
         gen_random_uuid(),
         m.\"deviceId\",
         m.\"sessionId\",
         m.\"gatewayId\",
         (date_trunc('day', m.\"capturedAt\" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS \"day\",
         floor(m.\"lat\" / 0.001)::int AS \"latBin\",
         floor(m.\"lon\" / 0.001)::int AS \"lonBin\",
         count(*)::int AS \"count\",
         avg(m.\"rssi\")::double precision AS \"rssiAvg\",
         avg(m.\"snr\")::double precision AS \"snrAvg\",
         min(m.\"rssi\")::int AS \"rssiMin\",
         max(m.\"rssi\")::int AS \"rssiMax\",
         min(m.\"snr\")::double precision AS \"snrMin\",
         max(m.\"snr\")::double precision AS \"snrMax\",
         now() AS \"updatedAt\"
       FROM \"Measurement\" m
       WHERE m.\"deviceId\" = ${DEVICE_ID_SQL}::uuid
         AND m.\"sessionId\" IS NOT NULL
       GROUP BY
         m.\"deviceId\", m.\"sessionId\", m.\"gatewayId\",
         (date_trunc('day', m.\"capturedAt\" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
         floor(m.\"lat\" / 0.001)::int, floor(m.\"lon\" / 0.001)::int
       RETURNING 1
     )
     SELECT (SELECT count(*) FROM deleted), (SELECT count(*) FROM inserted);")"

  COVERAGE_DELETED="$(awk -F'|' '{print $1}' <<<"$COVERAGE_COUNTS_RAW" | tr -d '[:space:]')"
  COVERAGE_INSERTED="$(awk -F'|' '{print $2}' <<<"$COVERAGE_COUNTS_RAW" | tr -d '[:space:]')"
  [[ "$COVERAGE_DELETED" =~ ^[0-9]+$ && "$COVERAGE_INSERTED" =~ ^[0-9]+$ ]] || \
    die "Failed rebuilding coverage bins"
  echo "Coverage bins rebuilt for device: deleted=$COVERAGE_DELETED inserted=$COVERAGE_INSERTED"
else
  echo "Skipped coverage bin rebuild (--no-rebuild-coverage)."
fi

echo "Sanitization complete."
