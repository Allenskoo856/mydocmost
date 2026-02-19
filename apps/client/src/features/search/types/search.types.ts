import { IUser } from "@/features/user/types/user.types.ts";
import { IGroup } from "@/features/group/types/group.types.ts";
import { ISpace } from "@/features/space/types/space.types.ts";
import { IPage } from "@/features/page/types/page.types.ts";

export interface IPageSearch {
  id: string;
  title: string;
  icon: string;
  parentPageId: string;
  slugId: string;
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
  rank: string;
  highlight: string;
  space: Partial<ISpace>;
  propertyOwnerId?: string | null;
  propertyStatus?: string | null;
  propertyPriority?: "P0" | "P1" | "P2" | "P3" | null;
  propertyDueAt?: Date | string | null;
  propertyTags?: string[];
}

export interface SearchSuggestionParams {
  query: string;
  includeUsers?: boolean;
  includeGroups?: boolean;
  includePages?: boolean;
  spaceId?: string;
  limit?: number;
}

export interface ISuggestionResult {
  users?: Partial<IUser[]>;
  groups?: Partial<IGroup[]>;
  pages?: Partial<IPage[]>;
}

export interface IPageSearchParams {
  query: string;
  spaceId?: string;
  shareId?: string;
  status?: string[];
  priority?: Array<"P0" | "P1" | "P2" | "P3">;
  ownerIds?: string[];
  tags?: string[];
  dueRange?: {
    from?: string;
    to?: string;
  };
}

export interface IAttachmentSearch {
  id: string;
  fileName: string;
  pageId: string;
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
  rank: string;
  highlight: string;
  space: {
    id: string;
    name: string;
    slug: string;
    icon: string;
  };
  page: {
    id: string;
    title: string;
    slugId: string;
  };
}
