import { IsNotEmpty, IsUUID } from 'class-validator';

export class OverwriteTemplateFromPageDto {
  @IsUUID()
  @IsNotEmpty()
  templateId: string;

  @IsUUID()
  @IsNotEmpty()
  pageId: string;
}
