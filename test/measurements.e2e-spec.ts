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
        scopes: [ApiKeyScope.INGEST]
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
});
