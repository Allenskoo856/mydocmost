import { IsNotEmpty, IsUUID } from 'class-validator';

export class TemplateHomeDto {
  @IsUUID()
  @IsNotEmpty()
  spaceId: string;
}
