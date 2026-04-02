import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Sessions e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let deviceId: string;
  let sessionId: string;
  let signalSessionId: string;
  let timestamps: { t0: Date; t1: Date; t2: Date };
  let signalTimestamps: { t0: Date; t1: Date; t2: Date };

  beforeAll(async () => {
    process.env.COVERAGE_WORKER_ENABLED = 'false';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);

    const device = await prisma.device.create({
      data: {
        deviceUid: `session-device-${Date.now()}`
      },
      select: { id: true }
    });
    deviceId = device.id;

    await prisma.deviceAutoSessionConfig.create({
      data: {
        deviceId,
        enabled: true,
        homeLat: 37.7695,
        homeLon: -122.4295,
        radiusMeters: 50,
        minOutsideSeconds: 30,
        minInsideSeconds: 120
      }
    });

    const session = await prisma.session.create({
      data: {
        deviceId,
        startedAt: new Date()
      },
      select: { id: true }
    });
    sessionId = session.id;

    const signalSession = await prisma.session.create({
      data: {
        deviceId,
        startedAt: new Date()
      },
      select: { id: true }
    });
    signalSessionId = signalSession.id;

    const base = new Date();
    timestamps = {
      t0: new Date(base.getTime()),
      t1: new Date(base.getTime() + 2000),
      t2: new Date(base.getTime() + 4000)
    };

    await prisma.measurement.createMany({
      data: [
        {
          deviceId,
          sessionId,
          capturedAt: timestamps.t0,
          lat: 37.77,
          lon: -122.43
        },
        {
          deviceId,
          sessionId,
          capturedAt: timestamps.t1,
          lat: 37.7705,
          lon: -122.4305
        },
        {
          deviceId,
          sessionId,
          capturedAt: timestamps.t2,
          lat: 37.771,
          lon: -122.431
        }
      ]
    });

    signalTimestamps = {
      t0: new Date(base.getTime() + 6000),
      t1: new Date(base.getTime() + 8000),
      t2: new Date(base.getTime() + 10_000)
    };

    await prisma.measurement.createMany({
      data: [
        {
          deviceId,
          sessionId: signalSessionId,
          capturedAt: signalTimestamps.t0,
          lat: 37.7711,
          lon: -122.4311,
          rssi: -120,
          snr: -5
        },
        {
          deviceId,
          sessionId: signalSessionId,
          capturedAt: signalTimestamps.t1,
          lat: 37.7712,
          lon: -122.4312,
          rssi: -110,
          snr: -3
        },
        {
          deviceId,
          sessionId: signalSessionId,
          capturedAt: signalTimestamps.t2,
          lat: 37.7713,
          lon: -122.4313,
          rssi: -100,
          snr: 0
        }
      ]
    });
  });

  afterAll(async () => {
    if (prisma && deviceId) {
      await prisma.deviceAutoSessionConfig.deleteMany({ where: { deviceId } });
    }
    if (prisma && (sessionId || signalSessionId)) {
      await prisma.measurement.deleteMany({ where: { sessionId: { in: [sessionId, signalSessionId] } } });
      await prisma.session.deleteMany({ where: { id: { in: [sessionId, signalSessionId] } } });
    }
    if (prisma && deviceId) {
      await prisma.device.deleteMany({ where: { id: deviceId } });
    }
    if (app) {
      await app.close();
    }
  });

  it('timeline returns min/max/count for a session', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/sessions/${sessionId}/timeline`)
      .expect(200);

    expect(response.body.sessionId).toBe(sessionId);
    expect(response.body.deviceId).toBe(deviceId);
    expect(response.body.count).toBe(3);
    expect(response.body.minCapturedAt).toBe(timestamps.t0.toISOString());
    expect(response.body.maxCapturedAt).toBe(timestamps.t2.toISOString());
  });

  it('window returns only points within the time range', async () => {
    const cursor = timestamps.t1.toISOString();
    const windowMs = 2000;

    const response = await request(app.getHttpServer())
      .get(`/api/sessions/${sessionId}/window?cursor=${encodeURIComponent(cursor)}&windowMs=${windowMs}`)
      .expect(200);

    expect(response.body.sessionId).toBe(sessionId);
    expect(response.body.cursor).toBe(cursor);
    expect(response.body.from).toBe(new Date(timestamps.t1.getTime() - 1000).toISOString());
    expect(response.body.to).toBe(new Date(timestamps.t1.getTime() + 1000).toISOString());
    expect(response.body.items.length).toBe(1);
    expect(response.body.items[0].capturedAt).toBe(cursor);
  });

  it('overview returns a sampled full-session track', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/sessions/${sessionId}/overview?sample=2`)
      .expect(200);

    expect(response.body.sessionId).toBe(sessionId);
    expect(response.body.items).toEqual([
      {
        capturedAt: timestamps.t0.toISOString(),
        lat: 37.77,
        lon: -122.43
      },
      {
        capturedAt: timestamps.t2.toISOString(),
        lat: 37.771,
        lon: -122.431
      }
    ]);
  });

  it('stats returns aggregate session metrics', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/sessions/${sessionId}/stats`)
      .expect(200);

    expect(response.body.sessionId).toBe(sessionId);
    expect(response.body.deviceId).toBe(deviceId);
    expect(response.body.startedAt).toEqual(expect.any(String));
    expect(response.body.endedAt).toBeNull();
    expect(response.body.minCapturedAt).toBe(timestamps.t0.toISOString());
    expect(response.body.maxCapturedAt).toBe(timestamps.t2.toISOString());
    expect(response.body.pointCount).toBe(3);
    expect(response.body.distanceMeters).toEqual(expect.any(Number));
    expect(response.body.distanceMeters).toBeGreaterThan(0);
    expect(response.body.bbox).toEqual({
      minLat: 37.77,
      minLon: -122.431,
      maxLat: 37.771,
      maxLon: -122.43
    });
    expect(response.body.home).toEqual({
      lat: 37.7695,
      lon: -122.4295,
      radiusMeters: 50
    });
    expect(response.body.farthestPoint).toMatchObject({
      capturedAt: timestamps.t2.toISOString(),
      lat: 37.771,
      lon: -122.431,
      rssi: null,
      snr: null
    });
    expect(response.body.farthestPoint.distanceMeters).toEqual(expect.any(Number));
    expect(response.body.farthestPoint.distanceMeters).toBeGreaterThan(0);
    expect(response.body.lastRangePoint).toMatchObject({
      capturedAt: timestamps.t2.toISOString(),
      lat: 37.771,
      lon: -122.431,
      rssi: null,
      snr: null
    });
    expect(response.body.rssi).toBeNull();
    expect(response.body.snr).toBeNull();
    expect(response.body.signalSourceUsed).toBeNull();
    expect(response.body.receiversCount).toBeNull();
  });

  it('stats returns range and edge signal summaries for signal sessions', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/sessions/${signalSessionId}/stats`)
      .expect(200);

    expect(response.body.sessionId).toBe(signalSessionId);
    expect(response.body.pointCount).toBe(3);
    expect(response.body.farthestPoint).toMatchObject({
      capturedAt: signalTimestamps.t2.toISOString(),
      lat: 37.7713,
      lon: -122.4313,
      rssi: -100,
      snr: 0
    });
    expect(response.body.lastRangePoint).toMatchObject({
      capturedAt: signalTimestamps.t2.toISOString(),
      lat: 37.7713,
      lon: -122.4313,
      rssi: -100,
      snr: 0
    });
    expect(response.body.rssi).toEqual({
      min: -120,
      max: -100,
      avg: -110,
      median: -110
    });
    expect(response.body.snr.min).toBe(-5);
    expect(response.body.snr.max).toBe(0);
    expect(response.body.snr.avg).toBeCloseTo(-8 / 3, 6);
    expect(response.body.snr.median).toBe(-3);
    expect(response.body.signalSourceUsed).toBe('measurement');
    expect(response.body.receiversCount).toBeNull();
  });

  it('signal-series requires metric', async () => {
    await request(app.getHttpServer()).get(`/api/sessions/${signalSessionId}/signal-series`).expect(400);
  });

  it('signal-series auto source falls back to measurement and supports sampling', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/sessions/${signalSessionId}/signal-series?metric=rssi&sample=2`)
      .expect(200);

    expect(response.body.sessionId).toBe(signalSessionId);
    expect(response.body.metric).toBe('rssi');
    expect(response.body.sourceUsed).toBe('measurement');
    expect(response.body.items).toEqual([
      { t: signalTimestamps.t0.toISOString(), v: -120 },
      { t: signalTimestamps.t2.toISOString(), v: -100 }
    ]);
  });

  it('signal-histogram requires metric', async () => {
    await request(app.getHttpServer()).get(`/api/sessions/${signalSessionId}/signal-histogram`).expect(400);
  });

  it('signal-histogram returns equal-width bins with counts', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/sessions/${signalSessionId}/signal-histogram?metric=rssi&bins=5`)
      .expect(200);

    expect(response.body.sessionId).toBe(signalSessionId);
    expect(response.body.metric).toBe('rssi');
    expect(response.body.sourceUsed).toBe('measurement');
    expect(Array.isArray(response.body.bins)).toBe(true);
    expect(response.body.bins).toHaveLength(5);

    const totalCount = response.body.bins.reduce((sum: number, bin: { count: number }) => sum + bin.count, 0);
    expect(totalCount).toBe(3);

    expect(response.body.bins[0].lo).toBeCloseTo(-120, 6);
    expect(response.body.bins[4].hi).toBeCloseTo(-100, 6);
  });
});
