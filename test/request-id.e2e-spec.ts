import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const UUID_V4_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Request ID propagation e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.COVERAGE_WORKER_ENABLED = 'false';
    process.env.LORAWAN_WORKER_ENABLED = 'false';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('echoes provided X-Request-Id in response header and error body', async () => {
    const requestId = `req-test-${Date.now()}`;

    const response = await request(app.getHttpServer())
      .get('/api/lorawan/events')
      .set('X-Request-Id', requestId)
      .expect(401);

    expect(response.headers['x-request-id']).toBe(requestId);
    expect(response.body.requestId).toBe(requestId);
    expect(response.body.statusCode).toBe(401);
  });

  it('generates X-Request-Id when missing', async () => {
    const response = await request(app.getHttpServer()).get('/healthz').expect(200);

    const requestId = response.headers['x-request-id'];
    expect(typeof requestId).toBe('string');
    expect(requestId).toMatch(UUID_V4_LIKE);
  });
});
