#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

command -v docker >/dev/null 2>&1 || {
  echo "ERROR: docker is required to generate keys." >&2
  exit 1
}

docker run --rm \
  -v "$ROOT_DIR":/work \
  -w /work \
  node:20-alpine \
  node scripts/setup/generate-secrets.js
