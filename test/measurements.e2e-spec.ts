import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiKeyScope } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashApiKey } from '../src/common/security/apiKey';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Measurements e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiKeyPlaintext: string;
  let apiKeyHash: string;
  let deviceUid: string;

  beforeAll(async () => {
    apiKeyPlaintext = `test-${Date.now()}`;
    apiKeyHash = hashApiKey(apiKeyPlaintext);
    deviceUid = `device-${Date.now()}`;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);

    await prisma.apiKey.create({
      data: {
        keyHash: apiKeyHash,
        scopes: [ApiKeyScope.INGEST, ApiKeyScope.QUERY]
      }
    });
  });

  afterAll(async () => {
    await prisma.measurement.deleteMany({
      where: {
        device: { deviceUid }
      }
    });
    await prisma.device.deleteMany({
      where: { deviceUid }
    });
    await prisma.apiKey.deleteMany({
      where: { keyHash: apiKeyHash }
    });
    await app.close();
  });

  it('ingests measurements and can query them', async () => {
    const payload = {
      items: [
        {
          deviceUid,
          capturedAt: new Date().toISOString(),
          lat: 37.77,
          lon: -122.43,
          rssi: -70,
          snr: 7.2
        }
      ]
    };

    const ingestResponse = await request(app.getHttpServer())
      .post('/api/measurements')
      .set('x-api-key', apiKeyPlaintext)
      .send(payload)
      .expect(201);

    expect(ingestResponse.body).toEqual(
      expect.objectContaining({
        inserted: 1,
        deviceUid
      })
    );

    const deviceId = ingestResponse.body.deviceId;
    expect(typeof deviceId).toBe('string');

    const listResponse = await request(app.getHttpServer())
      .get(`/api/measurements?deviceId=${deviceId}`)
      .expect(200);

    expect(Array.isArray(listResponse.body.items)).toBe(true);
    expect(listResponse.body.items.length).toBeGreaterThan(0);
  });

  it('stores rxMetadata and derives gateway summary', async () => {
    const capturedAt = new Date().toISOString();
    const payload = {
      items: [
        {
          deviceUid,
          capturedAt,
          lat: 37.771,
          lon: -122.431,
          rxMetadata: [
            { gateway_ids: { gateway_id: 'gw-a' }, rssi: -90, snr: 7.1 },
            { gateway_ids: { gateway_id: 'gw-b' }, rssi: -110, snr: 3.0 }
          ]
        }
      ]
    };

    await request(app.getHttpServer())
      .post('/api/measurements')
      .set('x-api-key', apiKeyPlaintext)
      .send(payload)
      .expect(201);

    const device = await prisma.device.findUnique({ where: { deviceUid }, select: { id: true } });
    expect(device?.id).toBeTruthy();

    const listResponse = await request(app.getHttpServer())
      .get(`/api/measurements?deviceId=${device?.id}`)
      .expect(200);

    const latest = listResponse.body.items.find((item: any) => item.capturedAt === capturedAt);
    expect(latest).toBeDefined();
    expect(latest.rxMetadata).not.toBeNull();
    expect(latest.gatewayId).toBe('gw-a');
  });

  it('lists gateways from rxMetadata', async () => {
    const payload = {
      items: [
        {
          deviceUid,
          capturedAt: new Date().toISOString(),
          lat: 37.772,
          lon: -122.432,
          rxMetadata: [
            { gateway_ids: { gateway_id: 'gw-a' }, rssi: -90, snr: 7.1 },
            { gateway_ids: { gateway_id: 'gw-b' }, rssi: -110, snr: 3.0 }
          ]
        }
      ]
    };

    await request(app.getHttpServer())
      .post('/api/measurements')
      .set('x-api-key', apiKeyPlaintext)
      .send(payload)
      .expect(201);

    const device = await prisma.device.findUnique({ where: { deviceUid }, select: { id: true } });
    expect(device?.id).toBeTruthy();

    const listResponse = await request(app.getHttpServer())
      .get(`/api/gateways?deviceId=${device?.id}`)
      .set('x-api-key', apiKeyPlaintext)
      .expect(200);

    const gateways = listResponse.body as Array<{ gatewayId: string; count: number }>;
    const gwA = gateways.find((row) => row.gatewayId === 'gw-a');
    const gwB = gateways.find((row) => row.gatewayId === 'gw-b');

    expect(gwA).toBeDefined();
    expect(gwB).toBeDefined();
    expect(gwA?.count ?? 0).toBeGreaterThan(0);
    expect(gwB?.count ?? 0).toBeGreaterThan(0);
  });
});
