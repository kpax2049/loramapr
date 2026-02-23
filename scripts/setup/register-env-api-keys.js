#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const { ApiKeyScope, PrismaClient } = require('@prisma/client');

function hashApiKey(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeValue(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

async function ensureApiKey(prisma, plaintext, scope, label) {
  const keyHash = hashApiKey(plaintext);

  const existing = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      revokedAt: null
    },
    select: {
      id: true,
      scopes: true
    }
  });

  if (!existing) {
    await prisma.apiKey.create({
      data: {
        keyHash,
        scopes: [scope],
        label
      }
    });
    return { created: true, updated: false };
  }

  if (existing.scopes.includes(scope)) {
    return { created: false, updated: false };
  }

  await prisma.apiKey.update({
    where: { id: existing.id },
    data: {
      scopes: [...existing.scopes, scope]
    }
  });
  return { created: false, updated: true };
}

async function main() {
  const queryKey = normalizeValue(process.env.QUERY_API_KEY);
  const ingestKey = normalizeValue(process.env.INGEST_API_KEY);

  if (!queryKey && !ingestKey) {
    console.log('[api-entrypoint] No QUERY_API_KEY/INGEST_API_KEY env values set; skipping key registration.');
    return;
  }

  const prisma = new PrismaClient();
  let created = 0;
  let updated = 0;

  try {
    if (queryKey) {
      const result = await ensureApiKey(prisma, queryKey, ApiKeyScope.QUERY, 'bootstrap:QUERY_API_KEY');
      if (result.created) {
        created += 1;
      }
      if (result.updated) {
        updated += 1;
      }
    }

    if (ingestKey) {
      const result = await ensureApiKey(prisma, ingestKey, ApiKeyScope.INGEST, 'bootstrap:INGEST_API_KEY');
      if (result.created) {
        created += 1;
      }
      if (result.updated) {
        updated += 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `[api-entrypoint] API key registration complete (created=${created}, updated=${updated}, skipped=${
      (queryKey ? 1 : 0) + (ingestKey ? 1 : 0) - created - updated
    }).`
  );
}

main().catch((error) => {
  console.error('[api-entrypoint] Failed to register API keys:', error?.message ?? error);
  process.exitCode = 1;
});
