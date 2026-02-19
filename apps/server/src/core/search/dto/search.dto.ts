import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PAGE_PRIORITY_OPTIONS } from '../../page/dto/create-page.dto';

class DueRangeDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class SearchDTO {
  @IsNotEmpty()
  @IsString()
  query: string;

  @IsOptional()
  @IsString()
  spaceId: string;

  @IsOptional()
  @IsString()
  shareId?: string;

  @IsOptional()
  @IsString()
  creatorId?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsNumber()
  offset?: number;

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
  @IsUUID('all', { each: true })
  ownerIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DueRangeDto)
  dueRange?: DueRangeDto;
}

export class SearchShareDTO extends SearchDTO {
  @IsNotEmpty()
  @IsString()
  shareId: string;

  @IsOptional()
  @IsString()
  spaceId: string;
}

export class SearchSuggestionDTO {
  @IsString()
  query: string;

  @IsOptional()
  @IsBoolean()
  includeUsers?: boolean;

  @IsOptional()
  @IsBoolean()
  includeGroups?: boolean;

  @IsOptional()
  @IsBoolean()
  includePages?: boolean;

  @IsOptional()
  @IsString()
  spaceId?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
