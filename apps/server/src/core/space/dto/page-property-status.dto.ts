import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
} from 'class-validator';

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
  statusOptions: string[];
}
