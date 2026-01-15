import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested
} from 'class-validator';

export class MeasurementIngestDto {
  @IsString()
  @IsNotEmpty()
  deviceUid!: string;

  @IsDateString()
  capturedAt!: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lon!: number;

  @IsOptional()
  @IsNumber()
  alt?: number;

  @IsOptional()
  @IsNumber()
  hdop?: number;

  @IsOptional()
  @IsInt()
  rssi?: number;

  @IsOptional()
  @IsNumber()
  snr?: number;

  @IsOptional()
  @IsInt()
  sf?: number;

  @IsOptional()
  @IsInt()
  bw?: number;

  @IsOptional()
  @IsNumber()
  freq?: number;

  @IsOptional()
  @IsString()
  gatewayId?: string;

  @IsOptional()
  @IsString()
  payloadRaw?: string;
}

export class MeasurementBatchIngestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeasurementIngestDto)
  measurements!: MeasurementIngestDto[];
}
