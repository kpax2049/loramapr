import { CoverageService } from '../src/modules/coverage/coverage.service';
import { BIN_SIZE_DEG } from '../src/modules/coverage/coverage.constants';

type FindManyArgs = {
  where: Record<string, unknown>;
  take: number;
  orderBy: Array<Record<string, 'asc' | 'desc'>>;
};

describe('CoverageService listBins', () => {
  it('uses integer bin filters for negative/decimal bbox values', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new CoverageService({
      coverageBin: { findMany }
    } as any);

    const day = new Date('2026-02-27T00:00:00.000Z');
    const bbox = {
      minLon: -122.4195,
      minLat: -37.7752,
      maxLon: -122.4185,
      maxLat: -37.7735
    };

    await service.listBins({
      deviceId: '5bf4376a-e7ca-4884-9558-f8bff5dbe89f',
      day,
      bbox,
      gatewayId: 'gw-neg',
      limit: 123
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deviceId: '5bf4376a-e7ca-4884-9558-f8bff5dbe89f',
          sessionId: { not: null },
          day,
          gatewayId: 'gw-neg',
          latBin: {
            gte: Math.floor(bbox.minLat / BIN_SIZE_DEG),
            lte: Math.floor(bbox.maxLat / BIN_SIZE_DEG)
          },
          lonBin: {
            gte: Math.floor(bbox.minLon / BIN_SIZE_DEG),
            lte: Math.floor(bbox.maxLon / BIN_SIZE_DEG)
          }
        }),
        take: 123,
        orderBy: [{ latBin: 'asc' }, { lonBin: 'asc' }, { gatewayId: 'asc' }]
      })
    );
  });

  it('returns items in deterministic sorted order', async () => {
    const unsortedItems = [
      {
        latBin: 11,
        lonBin: -5,
        count: 1,
        rssiAvg: null,
        snrAvg: null,
        rssiMin: null,
        rssiMax: null,
        snrMin: null,
        snrMax: null,
        gatewayId: 'gw-z'
      },
      {
        latBin: 10,
        lonBin: 8,
        count: 1,
        rssiAvg: null,
        snrAvg: null,
        rssiMin: null,
        rssiMax: null,
        snrMin: null,
        snrMax: null,
        gatewayId: 'gw-b'
      },
      {
        latBin: 10,
        lonBin: 8,
        count: 1,
        rssiAvg: null,
        snrAvg: null,
        rssiMin: null,
        rssiMax: null,
        snrMin: null,
        snrMax: null,
        gatewayId: 'gw-a'
      }
    ];

    const findMany = jest.fn().mockImplementation(async (args: FindManyArgs) => {
      const hasExpectedOrdering = JSON.stringify(args.orderBy) === JSON.stringify([
        { latBin: 'asc' },
        { lonBin: 'asc' },
        { gatewayId: 'asc' }
      ]);

      if (!hasExpectedOrdering) {
        return unsortedItems;
      }

      return [...unsortedItems].sort((a, b) => {
        if (a.latBin !== b.latBin) {
          return a.latBin - b.latBin;
        }
        if (a.lonBin !== b.lonBin) {
          return a.lonBin - b.lonBin;
        }
        return a.gatewayId.localeCompare(b.gatewayId);
      });
    });

    const service = new CoverageService({
      coverageBin: { findMany }
    } as any);

    const items = await service.listBins({
      sessionId: '56f46f26-ee3e-4438-aace-be1f9b69de7c',
      day: new Date('2026-02-27T00:00:00.000Z'),
      limit: 5000
    });

    expect(items.map((item) => [item.latBin, item.lonBin, item.gatewayId])).toEqual([
      [10, 8, 'gw-a'],
      [10, 8, 'gw-b'],
      [11, -5, 'gw-z']
    ]);
  });

  it('does not inject non-null session filter when sessionId is explicitly provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new CoverageService({
      coverageBin: { findMany }
    } as any);

    await service.listBins({
      sessionId: '56f46f26-ee3e-4438-aace-be1f9b69de7c',
      day: new Date('2026-02-27T00:00:00.000Z'),
      limit: 100
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sessionId: '56f46f26-ee3e-4438-aace-be1f9b69de7c'
        })
      })
    );
  });
});
