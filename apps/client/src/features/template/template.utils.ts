import { TemplateCategory, TemplateScene } from '@/features/template/types/template.types';

export const TEMPLATE_LABELS: Record<TemplateCategory, string> = {
  weekly_report: 'Weekly report',
  retrospective: 'Retrospective',
  meeting_notes: 'Meeting notes',
  sop: 'SOP',
  requirement_review: 'Requirement review',
};

export function getTemplateCategoryLabel(category?: string) {
  if (!category) return '-';
  return TEMPLATE_LABELS[category as TemplateCategory] || category;
}

export function getTemplateSceneLabel(scene: TemplateScene | string) {
  return TEMPLATE_LABELS[scene as TemplateCategory] || scene;
}
