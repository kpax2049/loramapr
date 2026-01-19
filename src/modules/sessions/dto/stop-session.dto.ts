import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class StopSessionDto {
  @IsUUID()
  sessionId!: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string | null;
}
