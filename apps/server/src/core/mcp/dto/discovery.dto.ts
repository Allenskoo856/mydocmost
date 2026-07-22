import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class McpGetContextDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;
}

export class McpListSpacesDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  query?: string;

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

export class McpSearchPagesDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsString()
  @MinLength(1)
  query: string;

  @IsOptional()
  @IsString()
  spaceId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset = 0;
}
