import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class StartSessionDto {
  @IsUUID()
  deviceId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;
}
