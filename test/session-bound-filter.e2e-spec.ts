import { MeasurementsService } from '../src/modules/measurements/measurements.service';
import { TracksService } from '../src/modules/tracks/tracks.service';

describe('Session-bound filtering for coverage-mode queries', () => {
  it('MeasurementsService applies sessionId IS NOT NULL when sessionBoundOnly=true and deviceId scope', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new MeasurementsService({
      measurement: { findMany }
    } as any);

    await service.query({
      deviceId: '9550b7ed-e722-4b12-afc0-e899cd3e3bf2',
      sessionBoundOnly: true,
      limit: 500
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deviceId: '9550b7ed-e722-4b12-afc0-e899cd3e3bf2',
          sessionId: { not: null }
        })
      })
    );
  });

  it('MeasurementsService keeps explicit sessionId filter when provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new MeasurementsService({
      measurement: { findMany }
    } as any);

    await service.query({
      deviceId: '9550b7ed-e722-4b12-afc0-e899cd3e3bf2',
      sessionId: 'f4a0d455-4db8-4f9f-a551-6d245ce7fdb1',
      sessionBoundOnly: true,
      limit: 500
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sessionId: 'f4a0d455-4db8-4f9f-a551-6d245ce7fdb1'
        })
      })
    );
  });

  it('TracksService applies sessionId IS NOT NULL when sessionBoundOnly=true and deviceId scope', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new TracksService({
      measurement: { findMany }
    } as any);

    await service.getTrack({
      deviceId: '9550b7ed-e722-4b12-afc0-e899cd3e3bf2',
      sessionBoundOnly: true,
      limit: 500
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deviceId: '9550b7ed-e722-4b12-afc0-e899cd3e3bf2',
          sessionId: { not: null }
        })
      })
    );
  });
});
