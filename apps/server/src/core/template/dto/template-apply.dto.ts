import { IsNotEmpty, IsUUID } from 'class-validator';

export class ApplyTemplateDto {
  @IsUUID()
  @IsNotEmpty()
  templateId: string;

  @IsUUID()
  @IsNotEmpty()
  spaceId: string;
}
