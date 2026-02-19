import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { TEMPLATE_CATEGORY_OPTIONS, TEMPLATE_SCENE_OPTIONS } from '../template.constants';

export class UpdateTemplateMetadataDto {
  @IsUUID()
  @IsNotEmpty()
  templateId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsIn(TEMPLATE_CATEGORY_OPTIONS)
  category?: string;

  @IsOptional()
  @IsArray()
  @IsIn(TEMPLATE_SCENE_OPTIONS, { each: true })
  scenes?: string[];

  @IsOptional()
  @IsUUID()
  maintainerId?: string;

  @IsOptional()
  @IsBoolean()
  isRecommended?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  recommendedOrder?: number;
}
