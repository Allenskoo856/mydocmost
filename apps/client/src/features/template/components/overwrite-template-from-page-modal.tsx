import { Button, Modal, Select, Stack, Text } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useOverwriteTemplateFromPageMutation,
  useTemplateManageListQuery,
} from '@/features/template/queries/template-query';
import { notifications } from '@mantine/notifications';

interface OverwriteTemplateFromPageModalProps {
  opened: boolean;
  onClose: () => void;
  pageId: string;
  spaceId: string;
}

export default function OverwriteTemplateFromPageModal({
  opened,
  onClose,
  pageId,
  spaceId,
}: OverwriteTemplateFromPageModalProps) {
  const { t } = useTranslation();
  const overwriteMutation = useOverwriteTemplateFromPageMutation();
  const [templateId, setTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setTemplateId(null);
    }
  }, [opened]);

  const manageQuery = useTemplateManageListQuery(
    opened
      ? {
          spaceId,
          page: 1,
          limit: 100,
          statuses: ['draft', 'published', 'unpublished'],
        }
      : null,
  );

  const options = useMemo(() => {
    return (manageQuery.data?.items || []).map((item) => ({
      value: item.id,
      label: `${item.name} [${item.status}]`,
    }));
  }, [manageQuery.data?.items]);

  async function handleConfirm() {
    if (!templateId) {
      notifications.show({ message: t('Please select a template'), color: 'yellow' });
      return;
    }

    await overwriteMutation.mutateAsync({
      templateId,
      pageId,
    });

    notifications.show({ message: t('Template content updated') });
    onClose();
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('Overwrite template content')}
      centered
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {t('Select a template to overwrite with current page content')}
        </Text>
        <Select
          data={options}
          value={templateId}
          onChange={setTemplateId}
          searchable
          clearable
          placeholder={t('Select template')}
        />

        <Button color="orange" onClick={handleConfirm} loading={overwriteMutation.isPending}>
          {t('Overwrite')}
        </Button>
      </Stack>
    </Modal>
  );
}
