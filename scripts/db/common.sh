#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_command() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || die "Missing required command: $cmd"
}

load_repo_env() {
  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

require_env_vars() {
  local missing=()
  local var_name
  for var_name in "$@"; do
    if [[ -z "${!var_name:-}" ]]; then
      missing+=("$var_name")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    die "Missing required env vars in $ENV_FILE: ${missing[*]}"
  fi
}

resolve_compose_context() {
  COMPOSE_ARGS=()

  if [[ -n "${COMPOSE_FILE:-}" ]]; then
    local compose_file="$COMPOSE_FILE"
    if [[ "$compose_file" != /* ]]; then
      compose_file="$REPO_ROOT/$compose_file"
    fi
    COMPOSE_ARGS+=(-f "$compose_file")
  fi

  local compose_project="${COMPOSE_PROJECT_NAME:-${COMPOSE_PROJECT:-}}"
  if [[ -n "$compose_project" ]]; then
    COMPOSE_ARGS+=(-p "$compose_project")
  fi
}

compose_cmd() {
  docker compose "${COMPOSE_ARGS[@]}" "$@"
}

require_compose() {
  require_command docker
  docker compose version >/dev/null 2>&1 || die "docker compose is required"
}

require_postgres_running() {
  local container_id
  container_id="$(compose_cmd ps -q postgres 2>/dev/null || true)"
  [[ -n "$container_id" ]] || die "Postgres service 'postgres' is not running. Start it with: docker compose up -d postgres"

  local running
  running="$(docker inspect -f '{{.State.Running}}' "$container_id" 2>/dev/null || true)"
  [[ "$running" == "true" ]] || die "Postgres container for service 'postgres' is not running"
}

resolve_api_service() {
  local services
  services="$(compose_cmd config --services 2>/dev/null || true)"
  if grep -qx "api" <<<"$services"; then
    echo "api"
    return
  fi
  if grep -qx "backend" <<<"$services"; then
    echo "backend"
    return
  fi
  echo ""
}

init_db_common() {
  require_compose
  load_repo_env
  resolve_compose_context
  require_env_vars POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD
  require_postgres_running
}
