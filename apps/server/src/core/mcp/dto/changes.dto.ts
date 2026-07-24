import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class McpPageChangeOperationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  clientId?: string;

  @IsIn(['create', 'update', 'move'])
  type: 'create' | 'update' | 'move';

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  spaceId?: string;

  @IsOptional()
  @IsString()
  parentPageId?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  targetParentPageId?: string | null;

  @IsOptional()
  @IsString()
  targetSpaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}

export class McpPlanPageChangesDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => McpPageChangeOperationDto)
  operations: McpPageChangeOperationDto[];
}

export class McpApplyPageChangesDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsString()
  @MinLength(1)
  planId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  idempotencyKey: string;
}
