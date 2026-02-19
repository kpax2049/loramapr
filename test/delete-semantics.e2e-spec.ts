import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiKeyScope } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashApiKey } from '../src/common/security/apiKey';
import { PrismaService } from '../src/prisma/prisma.service';

const DEVICE_UID_PREFIX = `delete-semantics-${Date.now()}`;
const DELETE_CONFIRMATION_VALUE = 'DELETE';

describe('Delete semantics e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let queryKeyPlaintext: string;
  let queryKeyHash: string;
  let apiKeyId: string | null = null;
  let isBootstrapped = false;
  let sequence = 0;

  beforeAll(async () => {
    process.env.COVERAGE_WORKER_ENABLED = 'false';
    process.env.LORAWAN_WORKER_ENABLED = 'false';
    process.env.RETENTION_RUN_AT_STARTUP = 'false';

    queryKeyPlaintext = `query-delete-${Date.now()}`;
    queryKeyHash = hashApiKey(queryKeyPlaintext);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);

    const apiKey = await prisma.apiKey.create({
      data: {
        keyHash: queryKeyHash,
        scopes: [ApiKeyScope.QUERY]
      },
      select: { id: true }
    });
    apiKeyId = apiKey.id;
    isBootstrapped = true;
  });

  afterEach(async () => {
    if (isBootstrapped) {
      await cleanupTestData(prisma);
    }
  });

  afterAll(async () => {
    if (isBootstrapped) {
      await cleanupTestData(prisma);
    }
    if (isBootstrapped && apiKeyId) {
      await prisma.apiKey.deleteMany({ where: { id: apiKeyId } });
    }
    if (isBootstrapped) {
      await app.close();
    }
  });

  it('deleting session with mode=delete detaches measurements and deletes the session row', async () => {
    const device = await createDevice();
    const session = await createSession(device.id);
    const measurementIds = await createMeasurements(device.id, session.id, 2);

    const response = await request(app.getHttpServer())
      .delete(`/api/sessions/${session.id}?mode=delete`)
      .set('x-api-key', queryKeyPlaintext)
      .set('x-confirm-delete', DELETE_CONFIRMATION_VALUE)
      .expect(200);

    expect(response.body).toEqual({
      mode: 'delete',
      deleted: true,
      detachedMeasurementsCount: 2
    });

    const deletedSession = await prisma.session.findUnique({
      where: { id: session.id },
      select: { id: true }
    });
    expect(deletedSession).toBeNull();

    const measurements = await prisma.measurement.findMany({
      where: { id: { in: measurementIds } },
      select: { id: true, sessionId: true }
    });

    expect(measurements).toHaveLength(2);
    expect(measurements.every((item) => item.sessionId === null)).toBe(true);
  });

  it('deleting session with mode=archive keeps session row and sets isArchived=true', async () => {
    const device = await createDevice();
    const session = await createSession(device.id);

    const response = await request(app.getHttpServer())
      .delete(`/api/sessions/${session.id}?mode=archive`)
      .set('x-api-key', queryKeyPlaintext)
      .expect(200);

    expect(response.body).toEqual({
      mode: 'archive',
      archived: true
    });

    const archivedSession = await prisma.session.findUnique({
      where: { id: session.id },
      select: { id: true, isArchived: true, archivedAt: true }
    });

    expect(archivedSession?.id).toBe(session.id);
    expect(archivedSession?.isArchived).toBe(true);
    expect(archivedSession?.archivedAt).not.toBeNull();
  });

  it('deleting device with mode=archive sets isArchived=true', async () => {
    const device = await createDevice();

    const response = await request(app.getHttpServer())
      .delete(`/api/devices/${device.id}?mode=archive`)
      .set('x-api-key', queryKeyPlaintext)
      .expect(200);

    expect(response.body.mode).toBe('archive');
    expect(response.body.device).toMatchObject({
      id: device.id,
      isArchived: true
    });

    const archivedDevice = await prisma.device.findUnique({
      where: { id: device.id },
      select: { id: true, isArchived: true }
    });

    expect(archivedDevice?.id).toBe(device.id);
    expect(archivedDevice?.isArchived).toBe(true);
  });

  it('hard delete requires X-Confirm-Delete header', async () => {
    const device = await createDevice();
    const session = await createSession(device.id);

    const sessionResponse = await request(app.getHttpServer())
      .delete(`/api/sessions/${session.id}?mode=delete`)
      .set('x-api-key', queryKeyPlaintext)
      .expect(400);

    expect(sessionResponse.body.message).toContain('X-Confirm-Delete');

    const deviceResponse = await request(app.getHttpServer())
      .delete(`/api/devices/${device.id}?mode=delete`)
      .set('x-api-key', queryKeyPlaintext)
      .expect(400);

    expect(deviceResponse.body.message).toContain('X-Confirm-Delete');

    const sessionStillExists = await prisma.session.findUnique({
      where: { id: session.id },
      select: { id: true }
    });
    const deviceStillExists = await prisma.device.findUnique({
      where: { id: device.id },
      select: { id: true }
    });

    expect(sessionStillExists?.id).toBe(session.id);
    expect(deviceStillExists?.id).toBe(device.id);
  });

  async function createDevice() {
    sequence += 1;
    const deviceUid = `${DEVICE_UID_PREFIX}-${sequence}`;
    return prisma.device.create({
      data: {
        deviceUid
      },
      select: { id: true, deviceUid: true }
    });
  }

  async function createSession(deviceId: string) {
    return prisma.session.create({
      data: {
        deviceId,
        startedAt: new Date()
      },
      select: { id: true }
    });
  }

  async function createMeasurements(deviceId: string, sessionId: string, count: number) {
    const createdIds: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const created = await prisma.measurement.create({
        data: {
          deviceId,
          sessionId,
          capturedAt: new Date(Date.now() + index * 1000),
          lat: 37.77 + index * 0.0001,
          lon: -122.43 - index * 0.0001
        },
        select: { id: true }
      });
      createdIds.push(created.id);
    }
    return createdIds;
  }
});

async function cleanupTestData(prisma: PrismaService) {
  const devices = await prisma.device.findMany({
    where: {
      deviceUid: {
        startsWith: DEVICE_UID_PREFIX
      }
    },
    select: {
      id: true,
      deviceUid: true
    }
  });

  if (devices.length === 0) {
    return;
  }

  const deviceIds = devices.map((item) => item.id);
  const deviceUids = devices.map((item) => item.deviceUid);

  await prisma.coverageBin.deleteMany({
    where: {
      deviceId: { in: deviceIds }
    }
  });

  await prisma.measurement.deleteMany({
    where: {
      deviceId: { in: deviceIds }
    }
  });

  await prisma.session.deleteMany({
    where: {
      deviceId: { in: deviceIds }
    }
  });

  await prisma.agentDecision.deleteMany({
    where: {
      deviceId: { in: deviceIds }
    }
  });

  await prisma.deviceAutoSessionConfig.deleteMany({
    where: {
      deviceId: { in: deviceIds }
    }
  });

  await prisma.webhookEvent.deleteMany({
    where: {
      deviceUid: {
        in: deviceUids
      }
    }
  });

  await prisma.device.deleteMany({
    where: {
      id: { in: deviceIds }
    }
  });
}
