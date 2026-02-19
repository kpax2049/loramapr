import { HttpStatus } from '@nestjs/common';
import { HealthController } from '../src/modules/health/health.controller';
import { PrismaService } from '../src/prisma/prisma.service';

function createController(queryRawImpl: () => Promise<unknown>): HealthController {
  const prismaMock = {
    $queryRaw: jest.fn().mockImplementation(queryRawImpl)
  };
  return new HealthController(prismaMock as unknown as PrismaService);
}

describe('HealthController /readyz behavior', () => {
  it('returns ready payload when DB check succeeds (200 by default)', async () => {
    const controller = createController(async () => 1);
    const status = jest.fn();
    const res = { status };

    const payload = await controller.getReadyz(res);

    expect(payload).toEqual({ status: 'ready' });
    expect(status).not.toHaveBeenCalled();
  });

  it('returns not_ready payload and 503 when DB check fails', async () => {
    const controller = createController(async () => {
      throw new Error('Database unreachable');
    });
    const status = jest.fn();
    const res = { status };

    const payload = await controller.getReadyz(res);

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(payload).toEqual({
      status: 'not_ready',
      error: 'Database unreachable'
    });
  });
});
