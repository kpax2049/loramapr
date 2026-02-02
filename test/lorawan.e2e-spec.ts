import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { deriveUplinkId } from '../src/modules/lorawan/uplink-id';
import { PrismaService } from '../src/prisma/prisma.service';
import { readFileSync } from 'fs';
import { join } from 'path';

type TtsPayload = Record<string, any>;

const fixturesDir = join(__dirname, 'fixtures', 'tts');
const withGpsFixture = loadFixture('uplink_with_gps.json');
const missingGpsFixture = loadFixture('uplink_missing_gps.json');
const noAsupFixture = loadFixture('uplink_no_asup_correlation.json');

describe('LoRaWAN uplink e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const apiKey = 'test-webhook-key';
  let trackedDeviceUids: string[] = [];
  let trackedUplinkIds: string[] = [];

  beforeAll(async () => {
    process.env.TTS_WEBHOOK_API_KEY = apiKey;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterEach(async () => {
    if (trackedDeviceUids.length > 0) {
      await prisma.measurement.deleteMany({
        where: {
          device: {
            deviceUid: { in: trackedDeviceUids }
          }
        }
      });
      await prisma.session.deleteMany({
        where: {
          device: {
            deviceUid: { in: trackedDeviceUids }
          }
        }
      });
      await prisma.device.deleteMany({
        where: { deviceUid: { in: trackedDeviceUids } }
      });
    }

    if (trackedDeviceUids.length > 0 || trackedUplinkIds.length > 0) {
      await prisma.webhookEvent.deleteMany({
        where: {
          OR: [
            trackedDeviceUids.length > 0 ? { deviceUid: { in: trackedDeviceUids } } : undefined,
            trackedUplinkIds.length > 0 ? { uplinkId: { in: trackedUplinkIds } } : undefined
          ].filter(Boolean) as object[]
        }
      });
    }

    trackedDeviceUids = [];
    trackedUplinkIds = [];
  });

  afterAll(async () => {
    await app.close();
  });

  it('uplink with gps ingests Measurement', async () => {
    const payload = clonePayload(withGpsFixture);
    const deviceUid = `dev-${Date.now()}`;
    payload.end_device_ids.dev_eui = deviceUid;
    payload.correlation_ids[0] = `as:up:test1-${Date.now()}`;

    const uplinkId = deriveUplinkId(payload);
    trackedDeviceUids.push(deviceUid);
    trackedUplinkIds.push(uplinkId);

    const beforeCount = await prisma.measurement.count({
      where: { device: { deviceUid } }
    });

    await request(app.getHttpServer())
      .post('/api/lorawan/uplink')
      .set('x-downlink-apikey', apiKey)
      .send(payload)
      .expect(200);

    const event = await prisma.webhookEvent.findUnique({
      where: { uplinkId },
      select: { processedAt: true, processingError: true }
    });

    expect(event?.processedAt).toBeTruthy();
    expect(event?.processingError).toBeNull();

    const afterCount = await prisma.measurement.count({
      where: { device: { deviceUid } }
    });

    expect(afterCount).toBe(beforeCount + 1);

    const measurement = await prisma.measurement.findFirst({
      where: { device: { deviceUid } },
      orderBy: { capturedAt: 'desc' },
      include: { device: true }
    });

    expect(measurement?.device.deviceUid).toBe(deviceUid);
  });

  it('duplicate uplinkId is idempotent', async () => {
    const payload = clonePayload(withGpsFixture);
    const deviceUid = `dev-${Date.now()}`;
    payload.end_device_ids.dev_eui = deviceUid;
    payload.correlation_ids[0] = `as:up:test2-${Date.now()}`;

    const uplinkId = deriveUplinkId(payload);
    trackedDeviceUids.push(deviceUid);
    trackedUplinkIds.push(uplinkId);

    const beforeCount = await prisma.measurement.count({
      where: { device: { deviceUid } }
    });

    await request(app.getHttpServer())
      .post('/api/lorawan/uplink')
      .set('x-downlink-apikey', apiKey)
      .send(payload)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/lorawan/uplink')
      .set('x-downlink-apikey', apiKey)
      .send(payload)
      .expect(200);

    const eventCount = await prisma.webhookEvent.count({
      where: { uplinkId }
    });

    expect(eventCount).toBe(1);

    const afterCount = await prisma.measurement.count({
      where: { device: { deviceUid } }
    });

    expect(afterCount).toBe(beforeCount + 1);
  });

  it('missing_gps does not ingest measurement', async () => {
    const payload = clonePayload(missingGpsFixture);
    const deviceUid = `dev-${Date.now()}`;
    payload.end_device_ids.dev_eui = deviceUid;
    payload.correlation_ids[0] = `as:up:test3-${Date.now()}`;

    const uplinkId = deriveUplinkId(payload);
    trackedDeviceUids.push(deviceUid);
    trackedUplinkIds.push(uplinkId);

    const beforeCount = await prisma.measurement.count({
      where: { device: { deviceUid } }
    });

    await request(app.getHttpServer())
      .post('/api/lorawan/uplink')
      .set('x-downlink-apikey', apiKey)
      .send(payload)
      .expect(200);

    const event = await prisma.webhookEvent.findUnique({
      where: { uplinkId },
      select: { processingError: true }
    });

    expect(event?.processingError).toBe('missing_gps');

    const afterCount = await prisma.measurement.count({
      where: { device: { deviceUid } }
    });

    expect(afterCount).toBe(beforeCount);
  });

  it('fallback uplinkId hashing works', async () => {
    const payload = clonePayload(noAsupFixture);
    const deviceUid = `tracker-${Date.now()}`;
    payload.end_device_ids.device_id = deviceUid;

    const uplinkId = deriveUplinkId(payload);
    trackedDeviceUids.push(deviceUid);
    trackedUplinkIds.push(uplinkId);

    await request(app.getHttpServer())
      .post('/api/lorawan/uplink')
      .set('x-downlink-apikey', apiKey)
      .send(payload)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/lorawan/uplink')
      .set('x-downlink-apikey', apiKey)
      .send(payload)
      .expect(200);

    const event = await prisma.webhookEvent.findUnique({
      where: { uplinkId },
      select: { uplinkId: true }
    });

    expect(event?.uplinkId).toBe(uplinkId);

    const eventCount = await prisma.webhookEvent.count({
      where: { uplinkId }
    });

    expect(eventCount).toBe(1);
  });

  it('uplink attaches to active session', async () => {
    const deviceUid = `dev-${Date.now()}`;
    const device = await prisma.device.create({
      data: {
        deviceUid,
        lastSeenAt: new Date()
      }
    });

    const session = await prisma.session.create({
      data: {
        deviceId: device.id,
        startedAt: new Date()
      }
    });

    trackedDeviceUids.push(deviceUid);

    const payload = clonePayload(withGpsFixture);
    payload.end_device_ids.dev_eui = deviceUid;
    payload.correlation_ids[0] = `as:up:test4-${Date.now()}`;

    const uplinkId = deriveUplinkId(payload);
    trackedUplinkIds.push(uplinkId);

    await request(app.getHttpServer())
      .post('/api/lorawan/uplink')
      .set('x-downlink-apikey', apiKey)
      .send(payload)
      .expect(200);

    const measurement = await prisma.measurement.findFirst({
      where: { deviceId: device.id },
      orderBy: { capturedAt: 'desc' }
    });

    expect(measurement?.sessionId).toBe(session.id);
  });
});

function loadFixture(name: string): TtsPayload {
  const raw = readFileSync(join(fixturesDir, name), 'utf8');
  return JSON.parse(raw) as TtsPayload;
}

function clonePayload(payload: TtsPayload): TtsPayload {
  return JSON.parse(JSON.stringify(payload)) as TtsPayload;
}
