import { BadRequestException, Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { RequireApiKeyScope } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_POINTS = 10000;

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: {
      capturedAt: string;
      rssi: number | null;
      snr: number | null;
      gatewayId: string | null;
      sf: number | null;
      bw: number | null;
      freq: number | null;
      deviceUid: string;
    };
  }>;
};

@Controller('api/export')
@UseGuards(ApiKeyGuard)
@RequireApiKeyScope(ApiKeyScope.QUERY)
export class ExportController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('session/:sessionId.geojson')
  async exportSession(
    @Param('sessionId') sessionId: string,
    @Res() res: any
  ): Promise<void> {
    const total = await this.prisma.measurement.count({ where: { sessionId } });
    if (total > MAX_POINTS) {
      throw new BadRequestException('Too many points; apply narrower filters');
    }

    const measurements = await this.prisma.measurement.findMany({
      where: { sessionId },
      orderBy: { capturedAt: 'asc' },
      take: MAX_POINTS,
      select: {
        capturedAt: true,
        lat: true,
        lon: true,
        rssi: true,
        snr: true,
        sf: true,
        bw: true,
        freq: true,
        gatewayId: true,
        device: { select: { deviceUid: true } }
      }
    });

    const features: GeoJsonFeatureCollection['features'] = measurements.map((row) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [row.lon, row.lat] },
      properties: {
        capturedAt: row.capturedAt.toISOString(),
        rssi: row.rssi ?? null,
        snr: row.snr ?? null,
        gatewayId: row.gatewayId ?? null,
        sf: row.sf ?? null,
        bw: row.bw ?? null,
        freq: row.freq ?? null,
        deviceUid: row.device.deviceUid
      }
    }));

    const payload: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features
    };

    res.setHeader('Content-Type', 'application/geo+json');
    res.status(200).json(payload);
  }
}
