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
  let createdMeasurementIds: string[] = [];
  let createdSessionIds: string[] = [];
  let createdDeviceIds: string[] = [];

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
    if (createdDeviceIds.length > 0) {
      await prisma.coverageBin.deleteMany({
        where: {
          deviceId: { in: createdDeviceIds }
        }
      });
    }
    if (createdSessionIds.length > 0) {
      await prisma.coverageBin.deleteMany({
        where: {
          sessionId: { in: createdSessionIds }
        }
      });
    }
    if (createdMeasurementIds.length > 0) {
      await prisma.measurement.deleteMany({
        where: {
          id: { in: createdMeasurementIds }
        }
      });
    }
    if (createdSessionIds.length > 0) {
      await prisma.session.deleteMany({
        where: {
          id: { in: createdSessionIds }
        }
      });
    }
    if (createdDeviceIds.length > 0) {
      await prisma.device.deleteMany({
        where: {
          id: { in: createdDeviceIds }
        }
      });
    }
    if (createdEventIds.length > 0) {
      await prisma.webhookEvent.deleteMany({
        where: {
          id: { in: createdEventIds }
        }
      });
    }
    createdEventIds = [];
    createdMeasurementIds = [];
    createdSessionIds = [];
    createdDeviceIds = [];
  });

  afterAll(async () => {
    if (createdDeviceIds.length > 0) {
      await prisma.coverageBin.deleteMany({
        where: {
          deviceId: { in: createdDeviceIds }
        }
      });
    }
    if (createdSessionIds.length > 0) {
      await prisma.coverageBin.deleteMany({
        where: {
          sessionId: { in: createdSessionIds }
        }
      });
    }
    if (createdMeasurementIds.length > 0) {
      await prisma.measurement.deleteMany({
        where: {
          id: { in: createdMeasurementIds }
        }
      });
    }
    if (createdSessionIds.length > 0) {
      await prisma.session.deleteMany({
        where: {
          id: { in: createdSessionIds }
        }
      });
    }
    if (createdDeviceIds.length > 0) {
      await prisma.device.deleteMany({
        where: {
          id: { in: createdDeviceIds }
        }
      });
    }
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

  it('previews and creates a recovered session from selected events', async () => {
    const now = Date.now();
    const deviceUid = `events-recover-device-${now}`;
    const device = await createDevice(deviceUid);
    const eventA = await createEvent({
      source: WebhookEventSource.MESHTASTIC,
      deviceUid,
      portnum: 'POSITION_APP',
      packetId: `events-recover-${now}-a`,
      receivedAt: new Date(now + 1_000),
      payloadJson: {
        decoded: {
          position: {
            latitude: 49.4,
            longitude: 7.6
          }
        }
      }
    });
    const eventB = await createEvent({
      source: WebhookEventSource.MESHTASTIC,
      deviceUid,
      portnum: 'POSITION_APP',
      packetId: `events-recover-${now}-b`,
      receivedAt: new Date(now + 4_000),
      payloadJson: {
        decoded: {
          position: {
            latitude: 49.401,
            longitude: 7.602
          }
        }
      }
    });

    await createMeasurementForEvent({
      deviceId: device.id,
      eventId: eventA.id,
      capturedAt: new Date(now + 1_000),
      lat: 49.4,
      lon: 7.6
    });
    await createMeasurementForEvent({
      deviceId: device.id,
      eventId: eventB.id,
      capturedAt: new Date(now + 4_000),
      lat: 49.401,
      lon: 7.602
    });

    const preview = await request(app.getHttpServer())
      .post('/api/events/recover-session/preview')
      .set('x-api-key', queryKeyPlaintext)
      .send({
        eventIds: [eventA.id, eventB.id]
      })
      .expect(201);

    expect(preview.body).toMatchObject({
      selectedEventCount: 2,
      eligibleEventCount: 2,
      eligibleMeasurementCount: 2,
      alreadyAssignedEventCount: 0,
      incompatibleEventCount: 0,
      canCreate: true,
      inferredDeviceId: device.id,
      inferredDeviceUid: deviceUid
    });
    expect(preview.body.startTime).toBe(new Date(now + 1_000).toISOString());
    expect(preview.body.endTime).toBe(new Date(now + 4_000).toISOString());

    const created = await request(app.getHttpServer())
      .post('/api/events/recover-session')
      .set('x-api-key', queryKeyPlaintext)
      .send({
        eventIds: [eventA.id, eventB.id],
        name: 'Recovered Walk',
        notes: 'Recovered from missed start'
      })
      .expect(201);

    expect(created.body).toMatchObject({
      deviceId: device.id,
      deviceUid,
      sessionName: 'Recovered Walk',
      selectedEventCount: 2,
      attachedEventCount: 2,
      attachedMeasurementCount: 2,
      startTime: new Date(now + 1_000).toISOString(),
      endTime: new Date(now + 4_000).toISOString(),
      durationMs: 3_000
    });
    expect(typeof created.body.sessionId).toBe('string');
    createdSessionIds.push(created.body.sessionId as string);

    const createdSession = await prisma.session.findUnique({
      where: { id: created.body.sessionId as string },
      select: { id: true, name: true, notes: true, startedAt: true, endedAt: true }
    });
    expect(createdSession).not.toBeNull();
    expect(createdSession?.name).toBe('Recovered Walk');
    expect(createdSession?.notes).toBe('Recovered from missed start');
    expect(createdSession?.startedAt.toISOString()).toBe(new Date(now + 1_000).toISOString());
    expect(createdSession?.endedAt?.toISOString()).toBe(new Date(now + 4_000).toISOString());

    const reassigned = await prisma.measurement.findMany({
      where: { sourceEventId: { in: [eventA.id, eventB.id] } },
      select: { sessionId: true }
    });
    expect(reassigned).toHaveLength(2);
    expect(
      reassigned.every((measurement) => measurement.sessionId === (created.body.sessionId as string))
    ).toBe(true);
  });

  it('blocks recovered-session creation when selected events are already assigned', async () => {
    const now = Date.now();
    const device = await createDevice(`events-recover-blocked-${now}`);
    const existingSession = await createSession(device.id, {
      name: 'Existing',
      startedAt: new Date(now - 60_000),
      endedAt: new Date(now - 30_000)
    });
    const assignedEvent = await createEvent({
      source: WebhookEventSource.MESHTASTIC,
      deviceUid: device.deviceUid,
      portnum: 'POSITION_APP',
      packetId: `events-recover-assigned-${now}`,
      receivedAt: new Date(now),
      payloadJson: {
        decoded: {
          position: {
            latitude: 49.5,
            longitude: 7.7
          }
        }
      }
    });
    await createMeasurementForEvent({
      deviceId: device.id,
      eventId: assignedEvent.id,
      capturedAt: new Date(now),
      lat: 49.5,
      lon: 7.7,
      sessionId: existingSession.id
    });

    const preview = await request(app.getHttpServer())
      .post('/api/events/recover-session/preview')
      .set('x-api-key', queryKeyPlaintext)
      .send({
        eventIds: [assignedEvent.id]
      })
      .expect(201);

    expect(preview.body).toMatchObject({
      selectedEventCount: 1,
      alreadyAssignedEventCount: 1,
      canCreate: false
    });
    expect(Array.isArray(preview.body.blockingErrors)).toBe(true);
    expect(String(preview.body.blockingErrors[0])).toContain('already assigned');

    const createAttempt = await request(app.getHttpServer())
      .post('/api/events/recover-session')
      .set('x-api-key', queryKeyPlaintext)
      .send({
        eventIds: [assignedEvent.id]
      })
      .expect(400);

    expect(String(createAttempt.body.message)).toContain('already assigned');
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

  async function createDevice(deviceUid: string) {
    const created = await prisma.device.create({
      data: {
        deviceUid
      },
      select: {
        id: true,
        deviceUid: true
      }
    });
    createdDeviceIds.push(created.id);
    return created;
  }

  async function createSession(
    deviceId: string,
    input: {
      name?: string;
      startedAt: Date;
      endedAt?: Date | null;
    }
  ) {
    const created = await prisma.session.create({
      data: {
        deviceId,
        name: input.name ?? null,
        startedAt: input.startedAt,
        endedAt: input.endedAt ?? null
      },
      select: { id: true }
    });
    createdSessionIds.push(created.id);
    return created;
  }

  async function createMeasurementForEvent(input: {
    deviceId: string;
    eventId: string;
    capturedAt: Date;
    lat: number;
    lon: number;
    sessionId?: string | null;
  }) {
    const created = await prisma.measurement.create({
      data: {
        deviceId: input.deviceId,
        sourceEventId: input.eventId,
        sessionId: input.sessionId ?? null,
        capturedAt: input.capturedAt,
        lat: input.lat,
        lon: input.lon,
        source: 'meshtastic'
      },
      select: { id: true }
    });
    createdMeasurementIds.push(created.id);
    return created;
  }
});
