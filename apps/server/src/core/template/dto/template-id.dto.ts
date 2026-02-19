import { IsNotEmpty, IsUUID } from 'class-validator';

export class TemplateIdDto {
  @IsUUID()
  @IsNotEmpty()
  templateId: string;
}
