import {
  IsOptional,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsUUID,
} from 'class-validator';

export class AskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  question: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsUUID()
  pageId?: string;
}
