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
  let timestamps: { t0: Date; t1: Date; t2: Date };

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

    const session = await prisma.session.create({
      data: {
        deviceId,
        startedAt: new Date()
      },
      select: { id: true }
    });
    sessionId = session.id;

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
  });

  afterAll(async () => {
    await prisma.measurement.deleteMany({ where: { sessionId } });
    await prisma.session.deleteMany({ where: { id: sessionId } });
    await prisma.device.deleteMany({ where: { id: deviceId } });
    await app.close();
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
    expect(response.body.rssi).toBeNull();
    expect(response.body.snr).toBeNull();
    expect(response.body.receiversCount).toBeNull();
  });
});
