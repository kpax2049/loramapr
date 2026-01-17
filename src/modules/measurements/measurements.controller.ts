import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { ApiKeyScopes } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { MeasurementBatchIngestDto, MeasurementIngestDto } from './dto/measurement-ingest.dto';
import { MeasurementIngestResult, MeasurementQueryResult, MeasurementsService } from './measurements.service';

type MeasurementsQuery = {
  deviceId?: string | string[];
  sessionId?: string | string[];
  from?: string | string[];
  to?: string | string[];
  bbox?: string | string[];
  limit?: string | string[];
};

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

@Controller('api/measurements')
export class MeasurementsController {
  constructor(private readonly measurementsService: MeasurementsService) {}

  @Get()
  async list(@Query() query: MeasurementsQuery): Promise<MeasurementQueryResult> {
    const deviceId = getSingleValue(query.deviceId, 'deviceId');
    const sessionId = getSingleValue(query.sessionId, 'sessionId');

    if (!deviceId && !sessionId) {
      throw new BadRequestException('deviceId or sessionId is required');
    }
    if (deviceId && sessionId) {
      throw new BadRequestException('Provide either deviceId or sessionId, not both');
    }

    const from = parseDate(getSingleValue(query.from, 'from'), 'from');
    const to = parseDate(getSingleValue(query.to, 'to'), 'to');
    if (from && to && from > to) {
      throw new BadRequestException('from must be before to');
    }

    const bboxValue = getSingleValue(query.bbox, 'bbox');
    const bbox = bboxValue ? parseBbox(bboxValue) : undefined;

    const requestedLimit = parseLimit(getSingleValue(query.limit, 'limit'));
    const limit = Math.min(requestedLimit, MAX_LIMIT);

    return this.measurementsService.query({
      deviceId: deviceId ?? undefined,
      sessionId: sessionId ?? undefined,
      from,
      to,
      bbox,
      limit
    });
  }

  @Post()
  @UseGuards(ApiKeyGuard)
  @ApiKeyScopes(ApiKeyScope.INGEST)
  async ingest(@Body() body: unknown): Promise<MeasurementIngestResult> {
    const measurements = await normalizeMeasurements(body);
    return this.measurementsService.ingest(measurements);
  }
}

async function normalizeMeasurements(body: unknown): Promise<MeasurementIngestDto[]> {
  if (Array.isArray(body)) {
    return validateMeasurements(body);
  }

  if (body && typeof body === 'object' && 'measurements' in body) {
    const payload = body as MeasurementBatchIngestDto;
    if (Array.isArray(payload.measurements)) {
      return validateMeasurements(payload.measurements);
    }
  }

  return [await validateMeasurement(body)];
}

async function validateMeasurements(inputs: unknown[]): Promise<MeasurementIngestDto[]> {
  const results: MeasurementIngestDto[] = [];
  for (let index = 0; index < inputs.length; index += 1) {
    results.push(await validateMeasurement(inputs[index], index));
  }
  return results;
}

async function validateMeasurement(input: unknown, index?: number): Promise<MeasurementIngestDto> {
  const dto = plainToInstance(MeasurementIngestDto, input);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length > 0) {
    const prefix = typeof index === 'number' ? `measurements[${index}]` : 'measurement';
    throw new BadRequestException({
      message: 'Invalid measurement payload',
      errors: collectValidationMessages(errors, prefix)
    });
  }
  return dto;
}

function collectValidationMessages(errors: ValidationError[], prefix: string): string[] {
  return errors.flatMap((error) => {
    const path = `${prefix}.${error.property}`;
    const constraints = error.constraints ? Object.values(error.constraints).map((msg) => `${path}: ${msg}`) : [];
    const children = error.children && error.children.length > 0 ? collectValidationMessages(error.children, path) : [];
    return [...constraints, ...children];
  });
}

function getSingleValue(
  value: string | string[] | undefined,
  name: string
): string | undefined {
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

function parseDate(value: string | undefined, name: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid ${name} timestamp`);
  }
  return parsed;
}

function parseLimit(value: string | undefined): number {
  if (!value) {
    return DEFAULT_LIMIT;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BadRequestException('limit must be a positive integer');
  }
  return parsed;
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
