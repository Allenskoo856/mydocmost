import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PAGE_PRIORITY_OPTIONS } from './create-page.dto';

export class DueRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class PagePropertiesPatchDto {
  @IsOptional()
  @IsUUID()
  ownerId?: string | null;

  @IsOptional()
  @IsString()
  status?: string | null;

  @IsOptional()
  @IsIn(PAGE_PRIORITY_OPTIONS)
  priority?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class PagePropertiesBatchUpdateDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  spaceId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  pageIds: string[];

  @ValidateNested()
  @Type(() => PagePropertiesPatchDto)
  patch: PagePropertiesPatchDto;
}

export class PageManageListDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  status?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(PAGE_PRIORITY_OPTIONS, { each: true })
  priority?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ownerIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DueRangeDto)
  dueRange?: DueRangeDto;

  @IsOptional()
  @IsString()
  sortBy?: 'updatedAt' | 'dueAt' | 'priority';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

export class PagePropertyTagsDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  spaceId: string;
}
