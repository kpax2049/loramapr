import { BadRequestException } from '@nestjs/common';
import { CoverageController } from '../src/modules/coverage/coverage.controller';

describe('CoverageController listBins query handling', () => {
  const dayNow = new Date('2026-02-27T15:16:17.000Z');
  let listBins: jest.Mock;
  let controller: CoverageController;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(dayNow);
    listBins = jest.fn().mockResolvedValue([]);
    controller = new CoverageController({ listBins } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('enforces XOR for deviceId and sessionId', async () => {
    await expect(controller.listBins({})).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.listBins({
        deviceId: '5bf4376a-e7ca-4884-9558-f8bff5dbe89f',
        sessionId: '56f46f26-ee3e-4438-aace-be1f9b69de7c'
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      controller.listBins({ deviceId: '5bf4376a-e7ca-4884-9558-f8bff5dbe89f' })
    ).resolves.toBeDefined();
    await expect(
      controller.listBins({ sessionId: '56f46f26-ee3e-4438-aace-be1f9b69de7c' })
    ).resolves.toBeDefined();
  });

  it('normalizes day to UTC midnight and applies default limit', async () => {
    await controller.listBins({
      deviceId: '5bf4376a-e7ca-4884-9558-f8bff5dbe89f',
      day: '2026-02-14T23:59:59.000Z'
    });

    expect(listBins).toHaveBeenCalledWith(
      expect.objectContaining({
        day: new Date('2026-02-14T00:00:00.000Z'),
        limit: 5000
      })
    );
  });

  it('clamps limit to max 20000 and rejects invalid limits', async () => {
    await controller.listBins({
      deviceId: '5bf4376a-e7ca-4884-9558-f8bff5dbe89f',
      limit: '25000'
    });

    expect(listBins).toHaveBeenLastCalledWith(
      expect.objectContaining({
        limit: 20000
      })
    );

    await expect(
      controller.listBins({
        deviceId: '5bf4376a-e7ca-4884-9558-f8bff5dbe89f',
        limit: '0'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.listBins({
        deviceId: '5bf4376a-e7ca-4884-9558-f8bff5dbe89f',
        limit: '1.5'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.listBins({
        deviceId: '5bf4376a-e7ca-4884-9558-f8bff5dbe89f',
        limit: 'abc'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('parses bbox in required order and rejects invalid bbox/day values', async () => {
    await controller.listBins({
      sessionId: '56f46f26-ee3e-4438-aace-be1f9b69de7c',
      bbox: '-122.5,-37.8,-122.4,-37.7',
      gatewayId: 'gw-1'
    });

    expect(listBins).toHaveBeenCalledWith(
      expect.objectContaining({
        bbox: {
          minLon: -122.5,
          minLat: -37.8,
          maxLon: -122.4,
          maxLat: -37.7
        },
        gatewayId: 'gw-1'
      })
    );

    await expect(
      controller.listBins({
        sessionId: '56f46f26-ee3e-4438-aace-be1f9b69de7c',
        day: 'not-a-date'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.listBins({
        sessionId: '56f46f26-ee3e-4438-aace-be1f9b69de7c',
        bbox: '-122.5,-37.8,-122.4'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.listBins({
        sessionId: '56f46f26-ee3e-4438-aace-be1f9b69de7c',
        bbox: '-122.5,-37.8,-122.5,-37.7'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.listBins({
        sessionId: '56f46f26-ee3e-4438-aace-be1f9b69de7c',
        bbox: '-122.5,-37.8,-122.4,-37.8'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
