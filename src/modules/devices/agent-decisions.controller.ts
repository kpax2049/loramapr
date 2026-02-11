import { BadRequestException, Body, Controller, HttpCode, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { RequireApiKeyScope } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { DevicesService } from './devices.service';

type DecisionBody = {
  deviceUid?: string;
  decision?: string;
  reason?: string | null;
  inside?: boolean;
  distanceM?: number;
  capturedAt?: string;
};

const ALLOWED_DECISIONS = new Set(['start', 'stop', 'noop', 'stale', 'disabled']);

@Controller('api/agent/decisions')
@UseGuards(ApiKeyGuard)
@RequireApiKeyScope(ApiKeyScope.INGEST)
export class AgentDecisionsController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @HttpCode(200)
  async create(@Body() body: DecisionBody): Promise<{ ok: true }> {
    const payload = parseBody(body);
    const inserted = await this.devicesService.recordAgentDecisionByUid(payload);
    if (!inserted) {
      throw new NotFoundException('Device not found');
    }
    return { ok: true };
  }
}

function parseBody(body: DecisionBody): {
  deviceUid: string;
  decision: string;
  reason?: string | null;
  inside?: boolean;
  distanceM?: number;
  capturedAt?: Date;
} {
  const deviceUid = body.deviceUid?.trim();
  if (!deviceUid) {
    throw new BadRequestException('deviceUid is required');
  }

  const decision = body.decision?.trim();
  if (!decision) {
    throw new BadRequestException('decision is required');
  }
  if (!ALLOWED_DECISIONS.has(decision)) {
    throw new BadRequestException('decision must be one of: start, stop, noop, stale, disabled');
  }

  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string') {
    throw new BadRequestException('reason must be a string');
  }
  if (body.inside !== undefined && typeof body.inside !== 'boolean') {
    throw new BadRequestException('inside must be a boolean');
  }
  if (body.distanceM !== undefined && (!Number.isFinite(body.distanceM) || body.distanceM < 0)) {
    throw new BadRequestException('distanceM must be a non-negative number');
  }

  let capturedAt: Date | undefined;
  if (body.capturedAt !== undefined) {
    const parsed = new Date(body.capturedAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('capturedAt must be a valid ISO timestamp');
    }
    capturedAt = parsed;
  }

  return {
    deviceUid,
    decision,
    reason: body.reason,
    inside: body.inside,
    distanceM: body.distanceM,
    capturedAt
  };
}
