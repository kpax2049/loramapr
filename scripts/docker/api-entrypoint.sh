#!/usr/bin/env sh
set -eu

echo "[api-entrypoint] Waiting for database availability..."
node scripts/wait-for-db.js

echo "[api-entrypoint] Running prisma migrate deploy..."
npx prisma migrate deploy

echo "[api-entrypoint] Starting API server..."
exec node dist/main.js
