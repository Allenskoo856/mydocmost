import { Space } from '@docmost/db/types/entity.types';

export class SearchResponseDto {
  id: string;
  title: string;
  icon: string;
  parentPageId: string;
  creatorId: string;
  propertyOwnerId?: string;
  propertyStatus?: string;
  propertyPriority?: string;
  propertyDueAt?: Date;
  propertyTags?: string[];
  rank: number;
  highlight: string;
  createdAt: Date;
  updatedAt: Date;
  space: Partial<Space>;
}
