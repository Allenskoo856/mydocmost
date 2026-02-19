import api from '@/lib/api-client';
import {
  IApplyTemplateInput,
  IApplyTemplateResult,
  ICreateTemplateFromPageInput,
  IOverwriteTemplateFromPageInput,
  ITemplate,
  ITemplateHomeResponse,
  ITemplateManageListParams,
  ITemplateSearchParams,
  IUpdateTemplateMetadataInput,
} from '@/features/template/types/template.types';
import { IPagination } from '@/lib/types';

export async function getTemplateHome(spaceId: string): Promise<ITemplateHomeResponse> {
  const req = await api.post<ITemplateHomeResponse>('/templates/home', { spaceId });
  return req.data;
}

export async function searchTemplates(
  params: ITemplateSearchParams,
): Promise<IPagination<ITemplate>> {
  const req = await api.post<IPagination<ITemplate>>('/templates/search', params);
  return req.data;
}

export async function getTemplateManageList(
  params: ITemplateManageListParams,
): Promise<IPagination<ITemplate>> {
  const req = await api.post<IPagination<ITemplate>>('/templates/manage/list', params);
  return req.data;
}

export async function getTemplateDetail(templateId: string): Promise<ITemplate> {
  const req = await api.post<ITemplate>('/templates/detail', { templateId });
  return req.data;
}

export async function createTemplateFromPage(
  input: ICreateTemplateFromPageInput,
): Promise<ITemplate> {
  const req = await api.post<ITemplate>('/templates/create-from-page', input);
  return req.data;
}

export async function updateTemplateMetadata(
  input: IUpdateTemplateMetadataInput,
): Promise<ITemplate> {
  const req = await api.post<ITemplate>('/templates/update-metadata', input);
  return req.data;
}

export async function overwriteTemplateFromPage(
  input: IOverwriteTemplateFromPageInput,
): Promise<ITemplate> {
  const req = await api.post<ITemplate>('/templates/overwrite-from-page', input);
  return req.data;
}

export async function publishTemplate(templateId: string): Promise<ITemplate> {
  const req = await api.post<ITemplate>('/templates/publish', { templateId });
  return req.data;
}

export async function unpublishTemplate(templateId: string): Promise<ITemplate> {
  const req = await api.post<ITemplate>('/templates/unpublish', { templateId });
  return req.data;
}

export async function deleteTemplate(templateId: string): Promise<{ success: boolean }> {
  const req = await api.post<{ success: boolean }>('/templates/delete', {
    templateId,
  });
  return req.data;
}

export async function applyTemplate(
  input: IApplyTemplateInput,
): Promise<IApplyTemplateResult> {
  const req = await api.post<IApplyTemplateResult>('/templates/apply', input);
  return req.data;
}
