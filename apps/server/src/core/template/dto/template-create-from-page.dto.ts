import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { TEMPLATE_CATEGORY_OPTIONS, TEMPLATE_SCENE_OPTIONS } from '../template.constants';

export class CreateTemplateFromPageDto {
  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn(TEMPLATE_CATEGORY_OPTIONS)
  category: string;

  @IsArray()
  @IsIn(TEMPLATE_SCENE_OPTIONS, { each: true })
  scenes: string[];

  @IsOptional()
  @IsUUID()
  maintainerId?: string;
}
