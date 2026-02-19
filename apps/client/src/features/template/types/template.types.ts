import { IPage } from '@/features/page/types/page.types';

export const TEMPLATE_CATEGORY_OPTIONS = [
  'weekly_report',
  'retrospective',
  'meeting_notes',
  'sop',
  'requirement_review',
] as const;

export const TEMPLATE_SCENE_OPTIONS = [...TEMPLATE_CATEGORY_OPTIONS] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORY_OPTIONS)[number];
export type TemplateScene = (typeof TEMPLATE_SCENE_OPTIONS)[number];

export type TemplateStatus = 'draft' | 'published' | 'unpublished' | 'deleted';

export interface ITemplateUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface ITemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  scenes: TemplateScene[];
  maintainerId?: string | null;
  creatorId?: string | null;
  updaterId?: string | null;
  spaceId: string;
  workspaceId: string;
  icon?: string | null;
  content?: any;
  textContent?: string | null;
  propertyOwnerId?: string | null;
  propertyStatus?: string | null;
  propertyPriority?: 'P0' | 'P1' | 'P2' | 'P3' | null;
  propertyDueAt?: string | null;
  propertyTags?: string[];
  status: TemplateStatus;
  isRecommended: boolean;
  recommendedOrder?: number | null;
  publishedAt?: string | null;
  publishedById?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  creator?: ITemplateUser;
  maintainer?: ITemplateUser;
  usageCount?: number;
  lastUsedAt?: string;
}

export interface ITemplateHomeResponse {
  teamCommon: ITemplate[];
  officialRecommended: ITemplate[];
  recentUsed: ITemplate[];
}

export interface ITemplateSearchParams {
  spaceId: string;
  keyword?: string;
  category?: TemplateCategory;
  scenes?: TemplateScene[];
  page?: number;
  limit?: number;
}

export interface ITemplateManageListParams extends ITemplateSearchParams {
  statuses?: Array<'draft' | 'published' | 'unpublished'>;
}

export interface ICreateTemplateFromPageInput {
  pageId: string;
  name: string;
  category: TemplateCategory;
  scenes: TemplateScene[];
  maintainerId?: string;
}

export interface IUpdateTemplateMetadataInput {
  templateId: string;
  name?: string;
  category?: TemplateCategory;
  scenes?: TemplateScene[];
  maintainerId?: string;
  isRecommended?: boolean;
  recommendedOrder?: number;
}

export interface IOverwriteTemplateFromPageInput {
  templateId: string;
  pageId: string;
}

export interface IApplyTemplateInput {
  templateId: string;
  spaceId: string;
}

export interface IApplyTemplateResult {
  page: IPage;
  warnings: string[];
}
