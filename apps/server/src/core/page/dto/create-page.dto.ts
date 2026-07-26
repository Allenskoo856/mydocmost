import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const PAGE_PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'] as const;

export class CreatePageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  parentPageId?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string | null;

  @IsOptional()
  @IsString()
  status?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(PAGE_PRIORITY_OPTIONS)
  priority?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];

  @IsUUID()
  spaceId: string;
}
