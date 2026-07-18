import { ISpace } from "@/features/space/types/space.types.ts";

export interface IPage {
  id: string;
  slugId: string;
  title: string;
  content?: unknown;
  renderedContent?: string;
  contentSize?: number;
  icon: string;
  coverPhoto: string;
  parentPageId: string;
  creatorId: string;
  spaceId: string;
  workspaceId: string;
  isLocked: boolean;
  lastUpdatedById: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  position: string;
  hasChildren: boolean;
  creator: ICreator;
  lastUpdatedBy: ILastUpdatedBy;
  deletedBy: IDeletedBy;
  space: Partial<ISpace>;
  propertyOwnerId?: string | null;
  propertyStatus?: string | null;
  propertyPriority?: "P0" | "P1" | "P2" | "P3" | null;
  propertyDueAt?: Date | string | null;
  propertyTags?: string[];
  ownerId?: string | null;
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
}

interface ICreator {
  id: string;
  name: string;
  avatarUrl: string;
}
interface ILastUpdatedBy {
  id: string;
  name: string;
  avatarUrl: string;
}

interface IDeletedBy {
  id: string;
  name: string;
  avatarUrl: string;
}

export interface IMovePage {
  pageId: string;
  position?: string;
  after?: string;
  before?: string;
  parentPageId?: string;
}

export interface IMovePageToSpace {
  pageId: string;
  spaceId: string;
}

export interface ICopyPageToSpace {
  pageId: string;
  spaceId?: string;
}

export interface SidebarPagesParams {
  spaceId?: string;
  pageId?: string;
  page?: number; // pagination
}

export interface IPageInput {
  pageId: string;
  title: string;
  parentPageId: string;
  icon: string;
  coverPhoto: string;
  position: string;
  isLocked: boolean;
  ownerId?: string | null;
  status?: string | null;
  priority?: "P0" | "P1" | "P2" | "P3" | null;
  dueAt?: string | null;
  tags?: string[];
  includeContent?: boolean;
  includeRenderedContent?: boolean;
}

export interface IPageManageListParams {
  spaceId: string;
  page?: number;
  limit?: number;
  keyword?: string;
  status?: string[];
  priority?: Array<"P0" | "P1" | "P2" | "P3">;
  ownerIds?: string[];
  tags?: string[];
  dueRange?: {
    from?: string;
    to?: string;
  };
  sortBy?: "updatedAt" | "dueAt" | "priority";
  sortOrder?: "asc" | "desc";
}

export interface IPagePropertiesBatchPatch {
  ownerId?: string | null;
  status?: string | null;
  priority?: "P0" | "P1" | "P2" | "P3" | null;
  dueAt?: string | null;
  tags?: string[];
}

export interface IPagePropertiesBatchUpdateInput {
  spaceId: string;
  pageIds: string[];
  patch: IPagePropertiesBatchPatch;
}

export interface IExportPageParams {
  pageId: string;
  format: ExportFormat;
  includeChildren?: boolean;
  includeAttachments?: boolean;
}

export enum ExportFormat {
  HTML = "html",
  Markdown = "markdown",
}
