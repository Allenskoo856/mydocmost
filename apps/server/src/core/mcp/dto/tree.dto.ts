import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class McpTreePageNodeDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => McpTreePageNodeDto)
  children?: McpTreePageNodeDto[];
}

export class McpInsertPageTreeDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  spaceId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  spaceName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i)
  spaceSlug?: string;

  @IsOptional()
  @IsString()
  parentPageId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => McpTreePageNodeDto)
  pages: McpTreePageNodeDto[];
}

export class McpListSpacePagesDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsString()
  spaceId: string;

  @IsOptional()
  @IsIn(['tree', 'flat'])
  format: 'tree' | 'flat' = 'tree';

  @IsOptional()
  @IsBoolean()
  includeDeleted = false;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset = 0;
}

export class McpAnalyzePageTreeDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsString()
  spaceId: string;
}

export class McpGetPageMarkdownDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsString()
  pageId: string;
}
