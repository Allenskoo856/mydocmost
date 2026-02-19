import {
  useMutation,
  useQuery,
  UseQueryResult,
  keepPreviousData,
} from '@tanstack/react-query';
import {
  applyTemplate,
  createTemplateFromPage,
  deleteTemplate,
  getTemplateDetail,
  getTemplateHome,
  getTemplateManageList,
  overwriteTemplateFromPage,
  publishTemplate,
  searchTemplates,
  unpublishTemplate,
  updateTemplateMetadata,
} from '@/features/template/services/template-service';
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
import { queryClient } from '@/main';

export function useTemplateHomeQuery(
  spaceId?: string,
): UseQueryResult<ITemplateHomeResponse, Error> {
  return useQuery({
    queryKey: ['template-home', spaceId],
    queryFn: () => getTemplateHome(spaceId),
    enabled: Boolean(spaceId),
  });
}

export function useTemplateSearchQuery(
  params: ITemplateSearchParams | null,
): UseQueryResult<IPagination<ITemplate>, Error> {
  return useQuery({
    queryKey: ['template-search', params],
    queryFn: () => searchTemplates(params),
    enabled: Boolean(params?.spaceId),
    placeholderData: keepPreviousData,
  });
}

export function useTemplateManageListQuery(
  params: ITemplateManageListParams | null,
): UseQueryResult<IPagination<ITemplate>, Error> {
  return useQuery({
    queryKey: ['template-manage-list', params],
    queryFn: () => getTemplateManageList(params),
    enabled: Boolean(params?.spaceId),
    placeholderData: keepPreviousData,
  });
}

export function useTemplateDetailQuery(
  templateId?: string,
): UseQueryResult<ITemplate, Error> {
  return useQuery({
    queryKey: ['template-detail', templateId],
    queryFn: () => getTemplateDetail(templateId),
    enabled: Boolean(templateId),
  });
}

export function useCreateTemplateFromPageMutation() {
  return useMutation<ITemplate, Error, ICreateTemplateFromPageInput>({
    mutationFn: (input) => createTemplateFromPage(input),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ['template-home', template.spaceId] });
      queryClient.invalidateQueries({ queryKey: ['template-manage-list'] });
    },
  });
}

export function useUpdateTemplateMetadataMutation() {
  return useMutation<ITemplate, Error, IUpdateTemplateMetadataInput>({
    mutationFn: (input) => updateTemplateMetadata(input),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ['template-home', template.spaceId] });
      queryClient.invalidateQueries({ queryKey: ['template-search'] });
      queryClient.invalidateQueries({ queryKey: ['template-manage-list'] });
      queryClient.invalidateQueries({ queryKey: ['template-detail', template.id] });
    },
  });
}

export function useOverwriteTemplateFromPageMutation() {
  return useMutation<ITemplate, Error, IOverwriteTemplateFromPageInput>({
    mutationFn: (input) => overwriteTemplateFromPage(input),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ['template-home', template.spaceId] });
      queryClient.invalidateQueries({ queryKey: ['template-manage-list'] });
      queryClient.invalidateQueries({ queryKey: ['template-detail', template.id] });
    },
  });
}

export function usePublishTemplateMutation() {
  return useMutation<ITemplate, Error, string>({
    mutationFn: (templateId) => publishTemplate(templateId),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ['template-home', template.spaceId] });
      queryClient.invalidateQueries({ queryKey: ['template-search'] });
      queryClient.invalidateQueries({ queryKey: ['template-manage-list'] });
      queryClient.invalidateQueries({ queryKey: ['template-detail', template.id] });
    },
  });
}

export function useUnpublishTemplateMutation() {
  return useMutation<ITemplate, Error, string>({
    mutationFn: (templateId) => unpublishTemplate(templateId),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ['template-home', template.spaceId] });
      queryClient.invalidateQueries({ queryKey: ['template-search'] });
      queryClient.invalidateQueries({ queryKey: ['template-manage-list'] });
      queryClient.invalidateQueries({ queryKey: ['template-detail', template.id] });
    },
  });
}

export function useDeleteTemplateMutation() {
  return useMutation<{ success: boolean }, Error, { templateId: string; spaceId: string }>({
    mutationFn: ({ templateId }) => deleteTemplate(templateId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['template-home', variables.spaceId] });
      queryClient.invalidateQueries({ queryKey: ['template-search'] });
      queryClient.invalidateQueries({ queryKey: ['template-manage-list'] });
    },
  });
}

export function useApplyTemplateMutation() {
  return useMutation<IApplyTemplateResult, Error, IApplyTemplateInput>({
    mutationFn: (input) => applyTemplate(input),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['recent-changes', variables.spaceId] });
      queryClient.invalidateQueries({ queryKey: ['root-sidebar-pages', variables.spaceId] });
      queryClient.invalidateQueries({ queryKey: ['template-home', variables.spaceId] });
      queryClient.invalidateQueries({ queryKey: ['template-manage-list'] });
      queryClient.setQueryData(['pages', result.page.id], result.page);
      queryClient.setQueryData(['pages', result.page.slugId], result.page);
    },
  });
}
