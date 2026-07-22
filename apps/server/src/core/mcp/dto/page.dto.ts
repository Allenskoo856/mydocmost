import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class McpCreatePageDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsString()
  spaceId: string;

  @IsOptional()
  @IsString()
  parentPageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class McpUpdatePageDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsString()
  pageId: string;

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

export class McpMovePageDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsString()
  pageId: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  targetParentPageId?: string | null;

  @IsOptional()
  @IsString()
  targetSpaceId?: string;
}
