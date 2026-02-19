import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiKeyScope } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashApiKey } from '../src/common/security/apiKey';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Status endpoint e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const queryKeyPlaintext = `status-query-${Date.now()}`;
  const ingestKeyPlaintext = `status-ingest-${Date.now()}`;
  let queryKeyId: string | null = null;
  let ingestKeyId: string | null = null;
  let createdWebhookId: string | null = null;

  beforeAll(async () => {
    process.env.LORAWAN_WORKER_ENABLED = 'false';
    process.env.RETENTION_RUN_AT_STARTUP = 'false';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const [queryApiKey, ingestApiKey] = await Promise.all([
      prisma.apiKey.create({
        data: {
          keyHash: hashApiKey(queryKeyPlaintext),
          scopes: [ApiKeyScope.QUERY]
        },
        select: { id: true }
      }),
      prisma.apiKey.create({
        data: {
          keyHash: hashApiKey(ingestKeyPlaintext),
          scopes: [ApiKeyScope.INGEST]
        },
        select: { id: true }
      })
    ]);

    queryKeyId = queryApiKey.id;
    ingestKeyId = ingestApiKey.id;
  });

  afterAll(async () => {
    if (createdWebhookId) {
      await prisma.webhookEvent.deleteMany({
        where: { id: createdWebhookId }
      });
    }
    if (queryKeyId) {
      await prisma.apiKey.deleteMany({
        where: { id: queryKeyId }
      });
    }
    if (ingestKeyId) {
      await prisma.apiKey.deleteMany({
        where: { id: ingestKeyId }
      });
    }
    await app.close();
  });

  it('rejects missing and wrong-scope API keys', async () => {
    await request(app.getHttpServer()).get('/api/status').expect(401);

    const wrongScopeResponse = await request(app.getHttpServer())
      .get('/api/status')
      .set('x-api-key', ingestKeyPlaintext)
      .expect(403);

    expect(wrongScopeResponse.body.message).toContain('Missing required API key scope');
  });

  it('returns compact status payload for QUERY-scope API key', async () => {
    const webhook = await prisma.webhookEvent.create({
      data: {
        source: 'meshtastic',
        payload: { test: true },
        processingError: 'missing_gps',
        processedAt: new Date(),
        receivedAt: new Date(Date.now() + 60_000)
      },
      select: {
        id: true,
        receivedAt: true,
        processingError: true
      }
    });
    createdWebhookId = webhook.id;

    const response = await request(app.getHttpServer())
      .get('/api/status')
      .set('x-api-key', queryKeyPlaintext)
      .expect(200);

    expect(typeof response.body.version).toBe('string');
    expect(typeof response.body.now).toBe('string');
    expect(Number.isNaN(Date.parse(response.body.now))).toBe(false);

    expect(response.body.db).toEqual(
      expect.objectContaining({
        ok: true
      })
    );
    expect(typeof response.body.db.latencyMs).toBe('number');

    expect(response.body.workers).toEqual(
      expect.objectContaining({
        webhookProcessor: expect.objectContaining({ ok: expect.any(Boolean) }),
        retention: expect.objectContaining({ ok: expect.any(Boolean) })
      })
    );

    expect(response.body.ingest).toEqual({
      latestWebhookReceivedAt: webhook.receivedAt.toISOString(),
      latestWebhookError: webhook.processingError
    });
  });
});
