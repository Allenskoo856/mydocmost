export const TEMPLATE_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  UNPUBLISHED: 'unpublished',
  DELETED: 'deleted',
} as const;

export const TEMPLATE_CATEGORY_OPTIONS = [
  'weekly_report',
  'retrospective',
  'meeting_notes',
  'sop',
  'requirement_review',
] as const;

export const TEMPLATE_SCENE_OPTIONS = [...TEMPLATE_CATEGORY_OPTIONS] as const;

export type TemplateStatus = (typeof TEMPLATE_STATUS)[keyof typeof TEMPLATE_STATUS];
