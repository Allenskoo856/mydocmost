import { Button, Modal, MultiSelect, Select, Stack, TextInput } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateTemplateFromPageMutation } from '@/features/template/queries/template-query';
import {
  TEMPLATE_CATEGORY_OPTIONS,
  TEMPLATE_SCENE_OPTIONS,
  TemplateCategory,
  TemplateScene,
} from '@/features/template/types/template.types';
import {
  getTemplateCategoryLabel,
  getTemplateSceneLabel,
} from '@/features/template/template.utils';
import { notifications } from '@mantine/notifications';
import { useSpaceMembersQuery } from '@/features/space/queries/space-query';

interface SaveTemplateFromPageModalProps {
  opened: boolean;
  onClose: () => void;
  pageId: string;
  spaceId: string;
  defaultName?: string;
}

export default function SaveTemplateFromPageModal({
  opened,
  onClose,
  pageId,
  spaceId,
  defaultName,
}: SaveTemplateFromPageModalProps) {
  const { t } = useTranslation();
  const mutation = useCreateTemplateFromPageMutation();
  const { data: members } = useSpaceMembersQuery(spaceId, { page: 1, limit: 200 });

  const [name, setName] = useState(defaultName || '');
  const [category, setCategory] = useState<TemplateCategory | null>(
    TEMPLATE_CATEGORY_OPTIONS[0],
  );
  const [scenes, setScenes] = useState<TemplateScene[]>([
    TEMPLATE_SCENE_OPTIONS[0],
  ]);
  const [maintainerId, setMaintainerId] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setName(defaultName || '');
    setCategory(TEMPLATE_CATEGORY_OPTIONS[0]);
    setScenes([TEMPLATE_SCENE_OPTIONS[0]]);
    setMaintainerId(null);
  }, [opened, defaultName]);

  const categoryOptions = useMemo(
    () =>
      TEMPLATE_CATEGORY_OPTIONS.map((value) => ({
        value,
        label: getTemplateCategoryLabel(value),
      })),
    [],
  );

  const sceneOptions = useMemo(
    () =>
      TEMPLATE_SCENE_OPTIONS.map((value) => ({
        value,
        label: getTemplateSceneLabel(value),
      })),
    [],
  );

  const maintainerOptions = useMemo(() => {
    return (members?.items || [])
      .filter((item: any) => item.type === 'user')
      .map((item: any) => ({ value: item.id, label: `${item.name} (${item.email})` }));
  }, [members?.items]);

  async function handleSubmit() {
    if (!name.trim() || !category || scenes.length === 0) {
      notifications.show({ message: t('Please complete required fields'), color: 'yellow' });
      return;
    }

    await mutation.mutateAsync({
      pageId,
      name: name.trim(),
      category,
      scenes,
      maintainerId: maintainerId || undefined,
    });

    notifications.show({ message: t('Template saved as draft') });
    onClose();
  }

  return (
    <Modal opened={opened} onClose={onClose} title={t('Save as template')} centered>
      <Stack>
        <TextInput
          label={t('Template name')}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />

        <Select
          label={t('Category')}
          value={category}
          onChange={(value) => setCategory(value as TemplateCategory)}
          data={categoryOptions}
          required
        />

        <MultiSelect
          label={t('Scenes')}
          value={scenes}
          onChange={(value) => setScenes(value as TemplateScene[])}
          data={sceneOptions}
          required
        />

        <Select
          label={t('Maintainer')}
          value={maintainerId}
          onChange={setMaintainerId}
          data={maintainerOptions}
          searchable
          clearable
        />

        <Button onClick={handleSubmit} loading={mutation.isPending}>
          {t('Save')}
        </Button>
      </Stack>
    </Modal>
  );
}
