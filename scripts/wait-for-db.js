#!/usr/bin/env node

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const TIMEOUT_MS = Number(process.env.DB_WAIT_TIMEOUT_MS ?? 60_000);
const BASE_DELAY_MS = Number(process.env.DB_WAIT_BASE_DELAY_MS ?? 500);
const MAX_DELAY_MS = Number(process.env.DB_WAIT_MAX_DELAY_MS ?? 5_000);

if (!DATABASE_URL) {
  console.error('[wait-for-db] DATABASE_URL is required');
  process.exit(1);
}

if (!Number.isFinite(TIMEOUT_MS) || TIMEOUT_MS <= 0) {
  console.error(`[wait-for-db] Invalid DB_WAIT_TIMEOUT_MS: ${process.env.DB_WAIT_TIMEOUT_MS}`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkDatabaseOnce() {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    await client.query('SELECT 1');
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const startTime = Date.now();
  let attempt = 0;
  let delayMs = Math.max(100, BASE_DELAY_MS);

  while (true) {
    attempt += 1;
    try {
      await checkDatabaseOnce();
      const elapsed = Date.now() - startTime;
      console.log(`[wait-for-db] Database reachable after ${attempt} attempt(s) in ${elapsed}ms`);
      return;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      const remaining = TIMEOUT_MS - elapsed;
      const message = error instanceof Error ? error.message : String(error);

      if (remaining <= 0) {
        console.error(
          `[wait-for-db] Database did not become reachable within ${TIMEOUT_MS}ms; last error: ${message}`
        );
        process.exit(1);
      }

      const waitMs = Math.min(delayMs, remaining);
      console.warn(
        `[wait-for-db] Attempt ${attempt} failed (${message}). Retrying in ${waitMs}ms...`
      );
      await sleep(waitMs);
      delayMs = Math.min(MAX_DELAY_MS, Math.floor(delayMs * 1.8));
    }
  }
}

void main();
