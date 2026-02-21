import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiKeyScope, Prisma, WebhookEventSource } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashApiKey } from '../src/common/security/apiKey';
import { buildWebhookPayloadText } from '../src/modules/events/payload-text';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Events API e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const queryKeyPlaintext = `events-query-${Date.now()}`;
  const ingestKeyPlaintext = `events-ingest-${Date.now()}`;
  let queryKeyId: string | null = null;
  let ingestKeyId: string | null = null;
  let createdEventIds: string[] = [];

  beforeAll(async () => {
    process.env.LORAWAN_WORKER_ENABLED = 'false';
    process.env.COVERAGE_WORKER_ENABLED = 'false';
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

  afterEach(async () => {
    if (createdEventIds.length === 0) {
      return;
    }
    await prisma.webhookEvent.deleteMany({
      where: {
        id: { in: createdEventIds }
      }
    });
    createdEventIds = [];
  });

  afterAll(async () => {
    if (createdEventIds.length > 0) {
      await prisma.webhookEvent.deleteMany({
        where: {
          id: { in: createdEventIds }
        }
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

  it('requires QUERY scope', async () => {
    await request(app.getHttpServer()).get('/api/events').expect(401);

    const wrongScope = await request(app.getHttpServer())
      .get('/api/events')
      .set('x-api-key', ingestKeyPlaintext)
      .expect(403);

    expect(wrongScope.body.message).toContain('Missing required API key scope');
  });

  it('lists events with filters and cursor pagination', async () => {
    const now = Date.now();
    const [latest, older, otherSource] = await Promise.all([
      createEvent({
        source: WebhookEventSource.MESHTASTIC,
        deviceUid: 'events-device-a',
        portnum: 'POSITION_APP',
        packetId: `events-pkt-${now}-1`,
        receivedAt: new Date(now + 3000),
        payloadJson: {
          id: 12345,
          rxRssi: -88,
          rxSnr: 11.5,
          hopLimit: 2,
          relayNode: 321,
          transportMechanism: 'serial',
          decoded: {
            position: {
              latitudeI: 493959195,
              longitudeI: 76103928,
              time: 1770935010
            }
          }
        }
      }),
      createEvent({
        source: WebhookEventSource.MESHTASTIC,
        deviceUid: 'events-device-a',
        portnum: 'POSITION_APP',
        packetId: `events-pkt-${now}-2`,
        receivedAt: new Date(now + 2000),
        payloadJson: {
          rxRssi: -96,
          rxSnr: 7.25,
          decoded: {
            position: {
              latitude: 49.4011,
              longitude: 7.6123,
              timestamp: 1770936010
            }
          }
        }
      }),
      createEvent({
        source: WebhookEventSource.LORAWAN,
        deviceUid: 'events-device-b',
        portnum: 'UPLINK',
        packetId: `events-pkt-${now}-3`,
        receivedAt: new Date(now + 1000),
        payloadJson: {
          uplink_message: {
            f_cnt: 20
          }
        }
      })
    ]);

    const firstPage = await request(app.getHttpServer())
      .get('/api/events')
      .query({
        source: 'meshtastic',
        deviceUid: 'events-device-a',
        portnum: 'POSITION_APP',
        limit: 1
      })
      .set('x-api-key', queryKeyPlaintext)
      .expect(200);

    expect(firstPage.body.items).toHaveLength(1);
    expect(firstPage.body.items[0]).toMatchObject({
      id: latest.id,
      source: 'meshtastic',
      deviceUid: 'events-device-a',
      portnum: 'POSITION_APP',
      packetId: latest.packetId,
      rxRssi: -88,
      rxSnr: 11.5,
      hopLimit: 2,
      relayNode: '321',
      transportMechanism: 'serial'
    });
    expect(firstPage.body.items[0].payloadJson).toBeUndefined();
    expect(firstPage.body.items[0].lat).toBeCloseTo(49.3959195, 6);
    expect(firstPage.body.items[0].lon).toBeCloseTo(7.6103928, 6);
    expect(firstPage.body.items[0].time).toBe('2026-02-12T22:23:30.000Z');
    expect(typeof firstPage.body.nextCursor).toBe('string');

    const secondPage = await request(app.getHttpServer())
      .get('/api/events')
      .query({
        source: 'meshtastic',
        deviceUid: 'events-device-a',
        portnum: 'POSITION_APP',
        limit: 1,
        cursor: firstPage.body.nextCursor
      })
      .set('x-api-key', queryKeyPlaintext)
      .expect(200);

    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.items[0].id).toBe(older.id);
    expect(secondPage.body.items[0].lat).toBe(49.4011);
    expect(secondPage.body.items[0].lon).toBe(7.6123);
    expect(secondPage.body.nextCursor).toBeUndefined();
    expect(secondPage.body.items.find((item: { id: string }) => item.id === otherSource.id)).toBeUndefined();
  });

  it('supports q filtering and event detail payload retrieval', async () => {
    const event = await createEvent({
      source: WebhookEventSource.SIM,
      deviceUid: 'events-device-q',
      portnum: 'NODEINFO_APP',
      packetId: `events-find-${Date.now()}`,
      payloadJson: {
        from: '!e616744a',
        longName: 'Field Node',
        decoded: {
          portnum: 'NODEINFO_APP'
        }
      }
    });

    const listResponse = await request(app.getHttpServer())
      .get('/api/events')
      .query({ q: 'find' })
      .set('x-api-key', queryKeyPlaintext)
      .expect(200);

    expect(listResponse.body.items).toHaveLength(1);
    expect(listResponse.body.items[0].id).toBe(event.id);

    const detailResponse = await request(app.getHttpServer())
      .get(`/api/events/${event.id}`)
      .set('x-api-key', queryKeyPlaintext)
      .expect(200);

    expect(detailResponse.body).toMatchObject({
      id: event.id,
      source: 'sim',
      deviceUid: 'events-device-q',
      portnum: 'NODEINFO_APP',
      packetId: event.packetId
    });
    expect(detailResponse.body.payloadJson).toEqual({
      from: '!e616744a',
      longName: 'Field Node',
      decoded: {
        portnum: 'NODEINFO_APP'
      }
    });
  });

  it('supports q filtering by payloadText tokens', async () => {
    const token = `payloadtoken${Date.now()}`;
    const event = await createEvent({
      source: WebhookEventSource.MESHTASTIC,
      deviceUid: 'events-device-payload',
      portnum: 'TELEMETRY_APP',
      packetId: `events-payload-${Date.now()}`,
      payloadJson: {
        fromId: '!abcd1234',
        decoded: {
          portnum: 'TELEMETRY_APP',
          user: {
            longName: token
          },
          telemetry: {
            deviceMetrics: {
              batteryLevel: 87
            }
          }
        }
      }
    });

    const response = await request(app.getHttpServer())
      .get('/api/events')
      .query({ q: token })
      .set('x-api-key', queryKeyPlaintext)
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].id).toBe(event.id);
  });

  it('rejects invalid cursor format', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/events?cursor=invalid')
      .set('x-api-key', queryKeyPlaintext)
      .expect(400);

    expect(response.body.message).toContain('cursor must be formatted');
  });

  async function createEvent(input: {
    source: WebhookEventSource;
    deviceUid: string;
    portnum: string;
    packetId: string;
    payloadJson: Prisma.InputJsonValue;
    receivedAt?: Date;
  }) {
    const created = await prisma.webhookEvent.create({
      data: {
        source: input.source,
        deviceUid: input.deviceUid,
        portnum: input.portnum,
        packetId: input.packetId,
        payloadText: buildWebhookPayloadText({
          deviceUid: input.deviceUid,
          portnum: input.portnum,
          packetId: input.packetId,
          payload: input.payloadJson
        }),
        payloadJson: input.payloadJson,
        receivedAt: input.receivedAt
      },
      select: {
        id: true,
        packetId: true
      }
    });
    createdEventIds.push(created.id);
    return created;
  }
});
