import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  IsString,
  IsUUID
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

  @IsOptional()
  @IsArray()
  rxMetadata?: any[];

  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
