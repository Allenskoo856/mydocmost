import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class DocDatabaseIdDto {
  @IsUUID()
  databaseId: string;
}

export class DocDatabaseViewIdDto {
  @IsUUID()
  viewId: string;
}

export class CreateDocDatabaseDto {
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class DocDatabaseInfoDto {
  @IsUUID()
  databaseId: string;
}

export class CreateDocDatabaseViewDto {
  @IsUUID()
  databaseId: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['table'])
  type?: 'table';

  @IsOptional()
  config?: any;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class SetDefaultDocDatabaseViewDto {
  @IsUUID()
  databaseId: string;

  @IsUUID()
  viewId: string;
}
