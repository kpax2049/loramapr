import { IsUUID } from 'class-validator';

export class StopSessionDto {
  @IsUUID()
  sessionId!: string;
}
