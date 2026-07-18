import { IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

export class McpCreatePageDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsUUID()
  parentPageId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class McpUpdatePageDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
  pageId: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class McpMovePageDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
  pageId: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  targetParentPageId?: string | null;

  @IsOptional()
  @IsUUID()
  targetSpaceId?: string;
}
