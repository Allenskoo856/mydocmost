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
  @IsUUID()
  workspaceId: string;

  @IsOptional()
  @IsUUID()
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
  @IsUUID()
  parentPageId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => McpTreePageNodeDto)
  pages: McpTreePageNodeDto[];
}

export class McpListSpacePagesDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
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
  limit = 100;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset = 0;
}

export class McpAnalyzePageTreeDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
  spaceId: string;
}

export class McpGetPageMarkdownDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
  pageId: string;
}
