import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID
} from 'class-validator';

export class RecoverSessionPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  eventIds!: string[];
}

export class RecoverSessionCreateDto extends RecoverSessionPreviewDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
