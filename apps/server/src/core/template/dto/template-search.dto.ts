import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  TEMPLATE_CATEGORY_OPTIONS,
  TEMPLATE_SCENE_OPTIONS,
  TEMPLATE_STATUS,
} from '../template.constants';

export class TemplateSearchDto {
  @IsUUID()
  @IsNotEmpty()
  spaceId: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(TEMPLATE_CATEGORY_OPTIONS)
  category?: string;

  @IsOptional()
  @IsArray()
  @IsIn(TEMPLATE_SCENE_OPTIONS, { each: true })
  scenes?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class TemplateManageListDto extends TemplateSearchDto {
  @IsOptional()
  @IsArray()
  @IsIn(
    [
      TEMPLATE_STATUS.DRAFT,
      TEMPLATE_STATUS.PUBLISHED,
      TEMPLATE_STATUS.UNPUBLISHED,
    ],
    { each: true },
  )
  statuses?: string[];
}
