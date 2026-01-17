import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { TrackResult, TracksService } from './tracks.service';

type TracksQuery = {
  deviceId?: string | string[];
  sessionId?: string | string[];
};

@Controller('api/tracks')
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Get()
  async getTrack(@Query() query: TracksQuery): Promise<TrackResult> {
    const deviceId = getSingleValue(query.deviceId, 'deviceId');
    const sessionId = getSingleValue(query.sessionId, 'sessionId');

    if (!deviceId && !sessionId) {
      throw new BadRequestException('deviceId or sessionId is required');
    }
    if (deviceId && sessionId) {
      throw new BadRequestException('Provide either deviceId or sessionId, not both');
    }

    return this.tracksService.getTrack({
      deviceId: deviceId ?? undefined,
      sessionId: sessionId ?? undefined
    });
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
