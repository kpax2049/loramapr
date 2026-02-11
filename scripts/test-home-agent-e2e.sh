#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
INGEST_API_KEY="${INGEST_API_KEY:-}"
QUERY_API_KEY="${QUERY_API_KEY:-}"
DEVICE_UID="${DEVICE_UID:-agent-e2e-$(date +%s)}"
POLL_INTERVAL_MS="${POLL_INTERVAL_MS:-1000}"
STALE_SECONDS="${STALE_SECONDS:-6}"

for cmd in curl jq node npx; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

if [[ -z "$INGEST_API_KEY" ]]; then
  echo "INGEST_API_KEY is required" >&2
  exit 1
fi
if [[ -z "$QUERY_API_KEY" ]]; then
  echo "QUERY_API_KEY is required" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
OUT_FILE="$TMP_DIR/out.json"
AGENT_LOG="$TMP_DIR/agent.log"
AGENT_PID=""

cleanup() {
  if [[ -n "$AGENT_PID" ]] && kill -0 "$AGENT_PID" >/dev/null 2>&1; then
    kill "$AGENT_PID" >/dev/null 2>&1 || true
    wait "$AGENT_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

pass() {
  echo "PASS: $1"
}

fail() {
  echo "FAIL: $1" >&2
  if [[ -f "$AGENT_LOG" ]]; then
    echo "--- agent log tail ---" >&2
    tail -n 80 "$AGENT_LOG" >&2 || true
  fi
  exit 1
}

request() {
  local method="$1"
  local url="$2"
  local api_key="${3:-}"
  local body="${4:-}"

  local -a args=(
    -sS
    -X "$method"
    "$url"
    -o "$OUT_FILE"
    -w "%{http_code}"
  )
  if [[ -n "$api_key" ]]; then
    args+=(-H "X-API-Key: $api_key")
  fi
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi
  curl "${args[@]}"
}

assert_status() {
  local got="$1"
  local expected="$2"
  local label="$3"
  if [[ "$got" != "$expected" ]]; then
    fail "$label (expected $expected, got $got)"
  fi
  pass "$label"
}

assert_status_any() {
  local got="$1"
  local expected_csv="$2"
  local label="$3"
  IFS=',' read -r -a expected <<<"$expected_csv"
  for item in "${expected[@]}"; do
    if [[ "$got" == "$item" ]]; then
      pass "$label"
      return
    fi
  done
  fail "$label (expected one of $expected_csv, got $got)"
}

iso_now() {
  node -e 'console.log(new Date().toISOString())'
}

wait_for_decision() {
  local device_id="$1"
  local decision="$2"
  local timeout_seconds="$3"

  local start
  start=$(date +%s)
  while true; do
    local status
    status=$(request GET "$API_BASE_URL/api/devices/$device_id/agent-decisions?limit=200" "$QUERY_API_KEY")
    if [[ "$status" == "200" ]]; then
      if jq -e --arg decision "$decision" '.items | any(.decision == $decision)' "$OUT_FILE" >/dev/null; then
        pass "Decision observed: $decision"
        return
      fi
    fi

    local now
    now=$(date +%s)
    if (( now - start >= timeout_seconds )); then
      fail "Timed out waiting for decision '$decision'"
    fi
    sleep 1
  done
}

wait_for_session_state() {
  local device_id="$1"
  local expected_active="$2"
  local timeout_seconds="$3"

  local start
  start=$(date +%s)
  while true; do
    local status
    status=$(request GET "$API_BASE_URL/api/sessions?deviceId=$device_id")
    if [[ "$status" == "200" ]]; then
      local active_count
      active_count=$(jq '[.items[] | select(.endedAt == null)] | length' "$OUT_FILE")
      if [[ "$expected_active" == "true" && "$active_count" -gt 0 ]]; then
        pass "Active session detected for device"
        return
      fi
      if [[ "$expected_active" == "false" && "$active_count" -eq 0 ]]; then
        pass "No active session for device"
        return
      fi
    fi

    local now
    now=$(date +%s)
    if (( now - start >= timeout_seconds )); then
      fail "Timed out waiting for expected session active=$expected_active"
    fi
    sleep 1
  done
}

echo "Running simulated home-agent e2e checks against $API_BASE_URL"
echo "Using DEVICE_UID=$DEVICE_UID"

status=$(request GET "$API_BASE_URL/health")
assert_status_any "$status" "200,404" "Backend reachable (health route)"

status=$(request GET "$API_BASE_URL/api/agent/devices/$DEVICE_UID/auto-session")
assert_status "$status" "401" "Missing key rejected"

status=$(request GET "$API_BASE_URL/api/agent/devices/$DEVICE_UID/auto-session" "bad-key")
assert_status "$status" "401" "Invalid key rejected"

status=$(request GET "$API_BASE_URL/api/agent/devices/$DEVICE_UID/auto-session" "$QUERY_API_KEY")
assert_status "$status" "403" "Wrong scope rejected"

captured_at="$(iso_now)"
measurement_body=$(jq -nc \
  --arg deviceUid "$DEVICE_UID" \
  --arg capturedAt "$captured_at" \
  '{deviceUid:$deviceUid,capturedAt:$capturedAt,lat:37.7700,lon:-122.4300}')
status=$(request POST "$API_BASE_URL/api/measurements" "$INGEST_API_KEY" "$measurement_body")
assert_status_any "$status" "200,201" "Seed measurement accepted"

status=$(request GET "$API_BASE_URL/api/agent/devices/$DEVICE_UID/latest-position" "$INGEST_API_KEY")
assert_status "$status" "200" "Latest position endpoint returns device data"
device_id=$(jq -r '.deviceId' "$OUT_FILE")
if [[ -z "$device_id" || "$device_id" == "null" ]]; then
  fail "latest-position did not return deviceId"
fi
pass "Resolved deviceId=$device_id"

status=$(request GET "$API_BASE_URL/api/agent/devices/$DEVICE_UID/auto-session" "$INGEST_API_KEY")
assert_status "$status" "200" "Auto-session endpoint reachable with INGEST key"

enable_body=$(jq -nc \
  '{enabled:true,homeLat:37.7700,homeLon:-122.4300,radiusMeters:20,minOutsideSeconds:3,minInsideSeconds:3}')
status=$(request PUT "$API_BASE_URL/api/devices/$device_id/auto-session" "$QUERY_API_KEY" "$enable_body")
assert_status "$status" "200" "Auto-session config enabled"

manual_decision_body=$(jq -nc \
  --arg deviceUid "$DEVICE_UID" \
  --arg capturedAt "$captured_at" \
  '{deviceUid:$deviceUid,decision:"noop",reason:"manual_smoke",capturedAt:$capturedAt}')
status=$(request POST "$API_BASE_URL/api/agent/decisions" "$INGEST_API_KEY" "$manual_decision_body")
assert_status "$status" "200" "Manual agent decision insert accepted"

status=$(request GET "$API_BASE_URL/api/devices/$device_id/agent-decisions?limit=200" "$QUERY_API_KEY")
assert_status "$status" "200" "Agent decisions list endpoint returns rows"
if ! jq -e '.items | any(.decision == "noop" and .reason == "manual_smoke")' "$OUT_FILE" >/dev/null; then
  fail "Manual noop decision not found in list"
fi
pass "Manual noop decision persisted"

API_BASE_URL="$API_BASE_URL" \
INGEST_API_KEY="$INGEST_API_KEY" \
DEVICE_UIDS="$DEVICE_UID" \
POLL_INTERVAL_MS="$POLL_INTERVAL_MS" \
STALE_SECONDS="$STALE_SECONDS" \
npx ts-node scripts/home-session-agent.ts >"$AGENT_LOG" 2>&1 &
AGENT_PID=$!
sleep 2
if ! kill -0 "$AGENT_PID" >/dev/null 2>&1; then
  fail "home-session-agent.ts exited early"
fi
pass "Home session agent started"

outside_body=$(jq -nc \
  --arg deviceUid "$DEVICE_UID" \
  --arg capturedAt "$(iso_now)" \
  '{deviceUid:$deviceUid,capturedAt:$capturedAt,lat:37.7800,lon:-122.4300}')
status=$(request POST "$API_BASE_URL/api/measurements" "$INGEST_API_KEY" "$outside_body")
assert_status_any "$status" "200,201" "Outside measurement ingested"

wait_for_decision "$device_id" "start" 25
wait_for_session_state "$device_id" "true" 20

inside_body=$(jq -nc \
  --arg deviceUid "$DEVICE_UID" \
  --arg capturedAt "$(iso_now)" \
  '{deviceUid:$deviceUid,capturedAt:$capturedAt,lat:37.7700,lon:-122.4300}')
status=$(request POST "$API_BASE_URL/api/measurements" "$INGEST_API_KEY" "$inside_body")
assert_status_any "$status" "200,201" "Inside measurement ingested"

wait_for_decision "$device_id" "stop" 25
wait_for_session_state "$device_id" "false" 20

sleep $((STALE_SECONDS + 3))
wait_for_decision "$device_id" "stale" 20

disable_body='{"enabled":false}'
status=$(request PUT "$API_BASE_URL/api/devices/$device_id/auto-session" "$QUERY_API_KEY" "$disable_body")
assert_status "$status" "200" "Auto-session config disabled"

wait_for_decision "$device_id" "disabled" 20

echo "All simulated home-agent checks passed."
echo "Decision stream for $DEVICE_UID:"
status=$(request GET "$API_BASE_URL/api/devices/$device_id/agent-decisions?limit=50" "$QUERY_API_KEY")
assert_status "$status" "200" "Fetched final decision list"
jq '.items | map({decision,reason,inside,distanceM,capturedAt,createdAt})' "$OUT_FILE"

