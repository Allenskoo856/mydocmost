import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PAGE_PROPERTY_KEYS } from '../../page/constants/page-properties.constants';

export class SpacePagePropertyStatusConfigDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  spaceId: string;
}

export class UpdateSpacePagePropertyStatusConfigDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  spaceId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  statusOptions: string[];

  @IsArray()
  @ArrayMaxSize(PAGE_PROPERTY_KEYS.length)
  @IsIn(PAGE_PROPERTY_KEYS, { each: true })
  enabledProperties: string[];
}

export class SpacePagePropertyOwnerQueryDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsString()
  query?: string;
}
