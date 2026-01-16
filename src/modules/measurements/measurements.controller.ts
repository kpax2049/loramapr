import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { ApiKeyScopes } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { MeasurementBatchIngestDto, MeasurementIngestDto } from './dto/measurement-ingest.dto';
import { MeasurementIngestResult, MeasurementsService } from './measurements.service';

@Controller('api/measurements')
@UseGuards(ApiKeyGuard)
@ApiKeyScopes(ApiKeyScope.INGEST)
export class MeasurementsController {
  constructor(private readonly measurementsService: MeasurementsService) {}

  @Post()
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
