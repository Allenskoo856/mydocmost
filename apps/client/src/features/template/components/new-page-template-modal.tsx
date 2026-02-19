import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useTemplateHomeQuery, useApplyTemplateMutation } from '@/features/template/queries/template-query';
import { notifications } from '@mantine/notifications';
import { buildPageUrl } from '@/features/page/page.utils';

interface NewPageTemplateModalProps {
  opened: boolean;
  onClose: () => void;
  spaceId: string;
  spaceSlug: string;
  onCreateBlank: () => void;
}

export default function NewPageTemplateModal({
  opened,
  onClose,
  spaceId,
  spaceSlug,
  onCreateBlank,
}: NewPageTemplateModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: homeData } = useTemplateHomeQuery(spaceId);
  const applyMutation = useApplyTemplateMutation();

  async function handleApply(templateId: string, status: string) {
    if (status !== 'published') {
      notifications.show({
        message: t('This template is unavailable'),
        color: 'yellow',
      });
      return;
    }

    try {
      const result = await applyMutation.mutateAsync({ templateId, spaceId });
      onClose();
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

  return (
    <Modal opened={opened} onClose={onClose} title={t('New page')} centered>
      <Stack>
        <Button
          fullWidth
          onClick={() => {
            onClose();
            onCreateBlank();
          }}
        >
          {t('Create blank page')}
        </Button>

        <Text fw={600}>{t('Recent used templates')}</Text>

        {(homeData?.recentUsed || []).slice(0, 5).map((item) => (
          <Group key={item.id} justify="space-between">
            <Text>{item.name}</Text>
            <Button
              size="xs"
              variant="light"
              disabled={item.status !== 'published'}
              onClick={() => handleApply(item.id, item.status)}
            >
              {item.status === 'published' ? t('Apply') : t('Unavailable')}
            </Button>
          </Group>
        ))}

        {(homeData?.recentUsed || []).length === 0 && (
          <Text c="dimmed" size="sm">
            {t('No recent templates')}
          </Text>
        )}

        <Button
          component={Link}
          to={`/s/${spaceSlug}/templates`}
          variant="default"
          onClick={onClose}
        >
          {t('Open template center')}
        </Button>
      </Stack>
    </Modal>
  );
}
