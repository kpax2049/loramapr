import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CoverageService } from './coverage.service';

type CoverageQuery = {
  deviceId?: string | string[];
  sessionId?: string | string[];
  day?: string | string[];
  bbox?: string | string[];
  gatewayId?: string | string[];
};

const BIN_SIZE = 0.001;

@Controller('api/coverage')
export class CoverageController {
  constructor(private readonly coverageService: CoverageService) {}

  @Get('bins')
  async listBins(@Query() query: CoverageQuery) {
    const deviceId = getSingleValue(query.deviceId, 'deviceId');
    const sessionId = getSingleValue(query.sessionId, 'sessionId');

    if (!deviceId && !sessionId) {
      throw new BadRequestException('deviceId or sessionId is required');
    }
    if (deviceId && sessionId) {
      throw new BadRequestException('Provide either deviceId or sessionId, not both');
    }

    const day = parseDay(getSingleValue(query.day, 'day'));
    const bboxValue = getSingleValue(query.bbox, 'bbox');
    const bbox = bboxValue ? parseBbox(bboxValue) : undefined;
    const gatewayId = getSingleValue(query.gatewayId, 'gatewayId');

    const bins = await this.coverageService.listBins({
      deviceId: deviceId ?? undefined,
      sessionId: sessionId ?? undefined,
      day,
      bbox,
      gatewayId: gatewayId ?? undefined
    });

    return {
      binSize: BIN_SIZE,
      bins
    };
  }
}

function getSingleValue(value: string | string[] | undefined, name: string): string | undefined {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return undefined;
    }
    if (value.length > 1) {
      throw new BadRequestException(`Multiple values provided for ${name}`);
    }
    return value[0];
  }
  return value;
}

function parseDay(value?: string): Date {
  if (!value) {
    return startOfUtcDay(new Date());
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('day must be a valid date');
  }
  return startOfUtcDay(parsed);
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function parseBbox(value: string): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
  const parts = value.split(',').map((part) => part.trim());
  if (parts.length !== 4) {
    throw new BadRequestException('bbox must be minLon,minLat,maxLon,maxLat');
  }

  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => Number.isNaN(part))) {
    throw new BadRequestException('bbox must contain valid numbers');
  }

  const [minLon, minLat, maxLon, maxLat] = numbers;
  if (minLon > maxLon || minLat > maxLat) {
    throw new BadRequestException('bbox min values must be <= max values');
  }

  return { minLon, minLat, maxLon, maxLat };
}
