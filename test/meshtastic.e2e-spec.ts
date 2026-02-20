import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiKeyScope, WebhookEventSource } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashApiKey } from '../src/common/security/apiKey';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Meshtastic ingest raw payload e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ingestKeyPlaintext = `mesh-ingest-${Date.now()}`;
  const queryKeyPlaintext = `mesh-query-${Date.now()}`;
  let ingestKeyId: string | null = null;
  let queryKeyId: string | null = null;
  const trackedPacketIds: string[] = [];

  beforeAll(async () => {
    process.env.LORAWAN_WORKER_ENABLED = 'false';
    process.env.RETENTION_RUN_AT_STARTUP = 'false';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const [ingestKey, queryKey] = await Promise.all([
      prisma.apiKey.create({
        data: {
          keyHash: hashApiKey(ingestKeyPlaintext),
          scopes: [ApiKeyScope.INGEST]
        },
        select: { id: true }
      }),
      prisma.apiKey.create({
        data: {
          keyHash: hashApiKey(queryKeyPlaintext),
          scopes: [ApiKeyScope.QUERY]
        },
        select: { id: true }
      })
    ]);

    ingestKeyId = ingestKey.id;
    queryKeyId = queryKey.id;
  });

  afterEach(async () => {
    if (trackedPacketIds.length === 0) {
      return;
    }
    await prisma.webhookEvent.deleteMany({
      where: {
        packetId: {
          in: trackedPacketIds
        }
      }
    });
    trackedPacketIds.length = 0;
  });

  afterAll(async () => {
    if (trackedPacketIds.length > 0) {
      await prisma.webhookEvent.deleteMany({
        where: {
          packetId: {
            in: trackedPacketIds
          }
        }
      });
    }
    if (ingestKeyId) {
      await prisma.apiKey.deleteMany({
        where: { id: ingestKeyId }
      });
    }
    if (queryKeyId) {
      await prisma.apiKey.deleteMany({
        where: { id: queryKeyId }
      });
    }
    await app.close();
  });

  it('stores full request body as payloadJson without reshaping', async () => {
    const packetId = `mesh-raw-${Date.now()}`;
    trackedPacketIds.push(packetId);

    const payload = {
      fromId: `mesh-node-${Date.now()}`,
      id: 3820271540,
      rxRssi: -101,
      rxSnr: 9.75,
      hopLimit: 3,
      relayNode: 84,
      transportMechanism: 'serial',
      decoded: {
        portnum: 'POSITION_APP',
        position: {
          latitudeI: 493959195,
          longitudeI: 76103928,
          time: 1770935010
        },
        telemetry: {
          deviceMetrics: {
            batteryLevel: 91,
            channelUtilization: 4.1
          }
        },
        user: {
          hwModel: 'TRACKER_L1',
          longName: 'Field Node',
          shortName: 'FN'
        }
      },
      _forwarder: {
        deviceHint: 'pi-home-node',
        receivedAt: '2026-02-20T00:00:00.000Z',
        eventId: 'e3b4b7b4'
      }
    };

    await request(app.getHttpServer())
      .post('/api/meshtastic/event')
      .set('x-api-key', ingestKeyPlaintext)
      .set('x-idempotency-key', packetId)
      .send(payload)
      .expect(200);

    const stored = await prisma.webhookEvent.findUnique({
      where: { packetId },
      select: {
        source: true,
        deviceUid: true,
        portnum: true,
        payloadJson: true
      }
    });

    expect(stored?.source).toBe(WebhookEventSource.MESHTASTIC);
    expect(stored?.deviceUid).toBe(payload.fromId);
    expect(stored?.portnum).toBe('POSITION_APP');
    expect(stored?.payloadJson).toEqual(payload);

    const detail = await request(app.getHttpServer())
      .get('/api/meshtastic/events')
      .set('x-api-key', queryKeyPlaintext)
      .query({ deviceUid: payload.fromId, limit: 1 })
      .expect(200);

    expect(detail.body.items).toHaveLength(1);
    const eventId = detail.body.items[0].id as string;

    const detailResponse = await request(app.getHttpServer())
      .get(`/api/meshtastic/events/${eventId}`)
      .set('x-api-key', queryKeyPlaintext)
      .expect(200);

    expect(detailResponse.body.payload).toEqual(payload);
    expect(detailResponse.body.uplinkId).toBe(packetId);
  });
});
