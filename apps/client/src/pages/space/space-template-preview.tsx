import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTemplateDetailQuery, useApplyTemplateMutation } from '@/features/template/queries/template-query';
import { useGetSpaceBySlugQuery } from '@/features/space/queries/space-query';
import { notifications } from '@mantine/notifications';
import { buildPageUrl } from '@/features/page/page.utils';
import {
  getTemplateCategoryLabel,
  getTemplateSceneLabel,
} from '@/features/template/template.utils';

export default function SpaceTemplatePreview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { spaceSlug, templateId } = useParams();
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);
  const { data: template, isLoading } = useTemplateDetailQuery(templateId);
  const applyMutation = useApplyTemplateMutation();

  async function handleApply() {
    if (!space?.id || !template) return;

    if (template.status !== 'published') {
      notifications.show({
        message: t('This template is unavailable'),
        color: 'yellow',
      });
      return;
    }

    try {
      const result = await applyMutation.mutateAsync({
        templateId: template.id,
        spaceId: space.id,
      });

      if (result.warnings?.length) {
        notifications.show({ message: result.warnings.join('; '), color: 'yellow' });
      }

      navigate(buildPageUrl(spaceSlug, result.page.slugId, result.page.title));
    } catch (err) {
      notifications.show({
        message: err?.response?.data?.message || t('Failed to apply template'),
        color: 'red',
      });
    }
  }

  if (isLoading || !template) {
    return <></>;
  }

  return (
    <Stack p="md" gap="md">
      <Group justify="space-between">
        <Text fw={700} size="xl">
          {template.name}
        </Text>
        <Group>
          <Button variant="default" onClick={() => navigate(-1)}>
            {t('Back')}
          </Button>
          <Button onClick={handleApply} disabled={template.status !== 'published'}>
            {t('Apply')}
          </Button>
        </Group>
      </Group>

      <Card withBorder>
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            {t('Category')}: {getTemplateCategoryLabel(template.category)}
          </Text>
          <Text size="sm" c="dimmed">
            {t('Scenes')}: {(template.scenes || []).map((it) => getTemplateSceneLabel(it)).join(', ')}
          </Text>
          <Text size="sm" c="dimmed">
            {t('Maintainer')}: {template.maintainer?.name || '-'}
          </Text>
          <Text size="sm" c="dimmed">
            {t('Updated at')}: {new Date(template.updatedAt).toLocaleString()}
          </Text>
        </Stack>
      </Card>

      <Card withBorder>
        <Text fw={600} mb="sm">
          {t('Preview')}
        </Text>
        <Text style={{ whiteSpace: 'pre-wrap' }}>{template.textContent || t('No preview content')}</Text>
      </Card>
    </Stack>
  );
}
