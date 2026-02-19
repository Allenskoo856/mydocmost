import {
  Badge,
  Button,
  Card,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Table,
  Tabs,
  TagsInput,
  Text,
  TextInput,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { useGetSpaceBySlugQuery, useSpaceMembersQuery } from '@/features/space/queries/space-query';
import { useSpaceAbility } from '@/features/space/permissions/use-space-ability';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '@/features/space/permissions/permissions.type';
import {
  useApplyTemplateMutation,
  useDeleteTemplateMutation,
  usePublishTemplateMutation,
  useTemplateHomeQuery,
  useTemplateManageListQuery,
  useTemplateSearchQuery,
  useUnpublishTemplateMutation,
  useUpdateTemplateMetadataMutation,
} from '@/features/template/queries/template-query';
import {
  TEMPLATE_CATEGORY_OPTIONS,
  TEMPLATE_SCENE_OPTIONS,
  ITemplate,
  TemplateCategory,
  TemplateScene,
} from '@/features/template/types/template.types';
import {
  getTemplateCategoryLabel,
  getTemplateSceneLabel,
} from '@/features/template/template.utils';
import { buildPageUrl } from '@/features/page/page.utils';
import Paginate from '@/components/common/paginate';

function TemplateStatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    draft: { color: 'gray', label: 'Draft' },
    published: { color: 'green', label: 'Published' },
    unpublished: { color: 'yellow', label: 'Unpublished' },
  };
  const value = map[status] || { color: 'gray', label: status };
  return <Badge color={value.color}>{value.label}</Badge>;
}

function TemplateCardItem({
  item,
  spaceSlug,
  onApply,
}: {
  item: ITemplate;
  spaceSlug: string;
  onApply: (item: ITemplate) => void;
}) {
  const { t } = useTranslation();
  const canApply = item.status === 'published';

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600}>{item.name}</Text>
          <TemplateStatusBadge status={item.status} />
        </Group>
        <Text size="sm" c="dimmed">
          {t('Category')}: {getTemplateCategoryLabel(item.category)}
        </Text>
        <Text size="sm" c="dimmed">
          {t('Scenes')}: {(item.scenes || []).map((it) => getTemplateSceneLabel(it)).join(', ') || '-'}
        </Text>
        <Group justify="space-between">
          <Button
            component={Link}
            to={`/s/${spaceSlug}/templates/${item.id}/preview`}
            variant="light"
            size="xs"
          >
            {t('Preview')}
          </Button>
          <Button
            size="xs"
            disabled={!canApply}
            onClick={() => onApply(item)}
          >
            {canApply ? t('Apply') : t('Unavailable')}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function TemplateMetaModal({
  opened,
  onClose,
  template,
  spaceId,
  canManageRecommendation,
}: {
  opened: boolean;
  onClose: () => void;
  template: ITemplate | null;
  spaceId: string;
  canManageRecommendation: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TemplateCategory | null>(null);
  const [scenes, setScenes] = useState<TemplateScene[]>([]);
  const [maintainerId, setMaintainerId] = useState<string | null>(null);
  const [isRecommended, setIsRecommended] = useState<string>('false');
  const [recommendedOrder, setRecommendedOrder] = useState<string>('0');
  const updateMutation = useUpdateTemplateMetadataMutation();
  const { data: members } = useSpaceMembersQuery(spaceId, { page: 1, limit: 200 });

  const maintainerOptions = useMemo(() => {
    return (members?.items || [])
      .filter((item: any) => item.type === 'user')
      .map((item: any) => ({ value: item.id, label: `${item.name} (${item.email})` }));
  }, [members?.items]);

  const categoryOptions = TEMPLATE_CATEGORY_OPTIONS.map((value) => ({
    value,
    label: getTemplateCategoryLabel(value),
  }));

  const sceneOptions = TEMPLATE_SCENE_OPTIONS.map((value) => ({
    value,
    label: getTemplateSceneLabel(value),
  }));

  useEffect(() => {
    if (!template || !opened) return;
    setName(template.name || '');
    setCategory((template.category as TemplateCategory) || null);
    setScenes((template.scenes || []) as TemplateScene[]);
    setMaintainerId(template.maintainerId || null);
    setIsRecommended(template.isRecommended ? 'true' : 'false');
    setRecommendedOrder(String(template.recommendedOrder || 0));
  }, [template, opened]);

  async function handleSave() {
    if (!template) return;
    if (!name.trim() || !category || scenes.length === 0) {
      notifications.show({ message: t('Please complete required fields'), color: 'yellow' });
      return;
    }

    await updateMutation.mutateAsync({
      templateId: template.id,
      name: name.trim(),
      category,
      scenes,
      maintainerId: maintainerId || undefined,
      ...(canManageRecommendation
        ? {
            isRecommended: isRecommended === 'true',
            recommendedOrder: Number(recommendedOrder) || 0,
          }
        : {}),
    });

    notifications.show({ message: t('Template updated successfully') });
    onClose();
  }

  return (
    <Modal opened={opened} onClose={onClose} title={t('Edit template metadata')} centered>
      <Stack>
        <TextInput
          label={t('Name')}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />

        <Select
          label={t('Category')}
          data={categoryOptions}
          value={category}
          onChange={(value) => setCategory(value as TemplateCategory)}
          required
        />

        <MultiSelect
          label={t('Scenes')}
          data={sceneOptions}
          value={scenes}
          onChange={(value) => setScenes(value as TemplateScene[])}
          required
        />

        <Select
          label={t('Maintainer')}
          data={maintainerOptions}
          value={maintainerId}
          onChange={setMaintainerId}
          searchable
          clearable
        />

        {canManageRecommendation && (
          <>
            <Select
              label={t('Official recommendation')}
              data={[
                { value: 'false', label: t('No') },
                { value: 'true', label: t('Yes') },
              ]}
              value={isRecommended}
              onChange={(value) => setIsRecommended(value || 'false')}
            />
            <TextInput
              label={t('Recommendation order')}
              value={recommendedOrder}
              onChange={(e) => setRecommendedOrder(e.currentTarget.value)}
            />
          </>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSave} loading={updateMutation.isPending}>
            {t('Save')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default function SpaceTemplateCenter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { spaceSlug } = useParams();
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);

  const spaceRules = space?.membership?.permissions;
  const spaceAbility = useSpaceAbility(spaceRules);
  const canManageSettings = spaceAbility.can(
    SpaceCaslAction.Manage,
    SpaceCaslSubject.Settings,
  );

  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<TemplateCategory | null>(null);
  const [scenes, setScenes] = useState<TemplateScene[]>([]);
  const [browsePage, setBrowsePage] = useState(1);

  const [manageKeyword, setManageKeyword] = useState('');
  const [manageCategory, setManageCategory] = useState<TemplateCategory | null>(null);
  const [manageScenes, setManageScenes] = useState<TemplateScene[]>([]);
  const [manageStatuses, setManageStatuses] = useState<string[]>([
    'draft',
    'published',
    'unpublished',
  ]);
  const [managePage, setManagePage] = useState(1);

  const homeQuery = useTemplateHomeQuery(space?.id);
  const searchQuery = useTemplateSearchQuery(
    space?.id
      ? {
          spaceId: space.id,
          page: browsePage,
          limit: 12,
          keyword: keyword || undefined,
          category: category || undefined,
          scenes: scenes.length ? scenes : undefined,
        }
      : null,
  );

  const manageQuery = useTemplateManageListQuery(
    space?.id
      ? {
          spaceId: space.id,
          page: managePage,
          limit: 20,
          keyword: manageKeyword || undefined,
          category: manageCategory || undefined,
          scenes: manageScenes.length ? manageScenes : undefined,
          statuses: canManageSettings
            ? (manageStatuses as Array<'draft' | 'published' | 'unpublished'>)
            : undefined,
        }
      : null,
  );

  const applyMutation = useApplyTemplateMutation();
  const publishMutation = usePublishTemplateMutation();
  const unpublishMutation = useUnpublishTemplateMutation();
  const deleteMutation = useDeleteTemplateMutation();

  const [editingTemplate, setEditingTemplate] = useState<ITemplate | null>(null);
  const [metaOpened, metaHandlers] = useDisclosure(false);

  const categoryOptions = TEMPLATE_CATEGORY_OPTIONS.map((value) => ({
    value,
    label: getTemplateCategoryLabel(value),
  }));

  const sceneOptions = TEMPLATE_SCENE_OPTIONS.map((value) => ({
    value,
    label: getTemplateSceneLabel(value),
  }));

  const hasSearchFilters = Boolean(keyword || category || scenes.length > 0);

  async function handleApply(template: ITemplate) {
    if (!space?.id) return;
    if (template.status !== 'published') {
      notifications.show({ message: t('This template is unavailable'), color: 'yellow' });
      return;
    }

    try {
      const result = await applyMutation.mutateAsync({
        templateId: template.id,
        spaceId: space.id,
      });

      if (result.warnings?.length) {
        notifications.show({
          message: result.warnings.join('; '),
          color: 'yellow',
        });
      }

      navigate(buildPageUrl(spaceSlug, result.page.slugId, result.page.title));
    } catch (err) {
      notifications.show({
        message: err?.response?.data?.message || t('Failed to apply template'),
        color: 'red',
      });
    }
  }

  async function handlePublish(templateId: string) {
    await publishMutation.mutateAsync(templateId);
    notifications.show({ message: t('Template published') });
  }

  async function handleUnpublish(templateId: string) {
    await unpublishMutation.mutateAsync(templateId);
    notifications.show({ message: t('Template unpublished') });
  }

  async function handleDelete(templateId: string) {
    if (!space?.id) return;
    await deleteMutation.mutateAsync({ templateId, spaceId: space.id });
    notifications.show({ message: t('Template deleted') });
  }

  if (!space) {
    return <></>;
  }

  return (
    <Stack p="md" gap="md">
      <Group justify="space-between">
        <Text fw={700} size="xl">
          {t('Template center')}
        </Text>
      </Group>

      <Tabs defaultValue="browse">
        <Tabs.List>
          <Tabs.Tab value="browse">{t('Browse')}</Tabs.Tab>
          <Tabs.Tab value="manage">{t('Manage')}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="browse" pt="md">
          <Group align="flex-end" mb="md">
            <TextInput
              label={t('Keyword')}
              placeholder={t('Search templates')}
              value={keyword}
              onChange={(e) => {
                setBrowsePage(1);
                setKeyword(e.currentTarget.value);
              }}
            />
            <Select
              label={t('Category')}
              data={categoryOptions}
              value={category}
              onChange={(value) => {
                setBrowsePage(1);
                setCategory(value as TemplateCategory);
              }}
              clearable
            />
            <MultiSelect
              label={t('Scenes')}
              data={sceneOptions}
              value={scenes}
              onChange={(value) => {
                setBrowsePage(1);
                setScenes(value as TemplateScene[]);
              }}
            />
          </Group>

          {hasSearchFilters ? (
            <>
              <Text fw={600} mb="sm">
                {t('Search results')}
              </Text>
              <Stack>
                {(searchQuery.data?.items || []).map((item) => (
                  <TemplateCardItem
                    key={item.id}
                    item={item}
                    spaceSlug={spaceSlug}
                    onApply={handleApply}
                  />
                ))}
              </Stack>

              {searchQuery.data?.items?.length === 0 && (
                <Text c="dimmed" ta="center" py="xl">
                  {t('No results found...')}
                </Text>
              )}

              {searchQuery.data && (
                <Paginate
                  currentPage={browsePage}
                  hasPrevPage={searchQuery.data.meta.hasPrevPage}
                  hasNextPage={searchQuery.data.meta.hasNextPage}
                  onPageChange={setBrowsePage}
                />
              )}
            </>
          ) : (
            <Stack gap="lg">
              <div>
                <Text fw={600} mb="sm">
                  {t('Team common')}
                </Text>
                <Stack>
                  {(homeQuery.data?.teamCommon || []).map((item) => (
                    <TemplateCardItem
                      key={item.id}
                      item={item}
                      spaceSlug={spaceSlug}
                      onApply={handleApply}
                    />
                  ))}
                  {homeQuery.data?.teamCommon?.length === 0 && (
                    <Text c="dimmed">{t('No templates yet')}</Text>
                  )}
                </Stack>
              </div>

              <div>
                <Text fw={600} mb="sm">
                  {t('Official recommended')}
                </Text>
                <Stack>
                  {(homeQuery.data?.officialRecommended || []).map((item) => (
                    <TemplateCardItem
                      key={item.id}
                      item={item}
                      spaceSlug={spaceSlug}
                      onApply={handleApply}
                    />
                  ))}
                  {homeQuery.data?.officialRecommended?.length === 0 && (
                    <Text c="dimmed">{t('No recommended templates')}</Text>
                  )}
                </Stack>
              </div>

              <div>
                <Text fw={600} mb="sm">
                  {t('Recent used')}
                </Text>
                <Stack>
                  {(homeQuery.data?.recentUsed || []).map((item) => (
                    <TemplateCardItem
                      key={item.id}
                      item={item}
                      spaceSlug={spaceSlug}
                      onApply={handleApply}
                    />
                  ))}
                  {homeQuery.data?.recentUsed?.length === 0 && (
                    <Text c="dimmed">{t('No recent templates')}</Text>
                  )}
                </Stack>
              </div>
            </Stack>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="manage" pt="md">
          <Group align="flex-end" mb="md">
            <TextInput
              label={t('Keyword')}
              value={manageKeyword}
              onChange={(e) => {
                setManagePage(1);
                setManageKeyword(e.currentTarget.value);
              }}
            />

            <Select
              label={t('Category')}
              data={categoryOptions}
              value={manageCategory}
              onChange={(value) => {
                setManagePage(1);
                setManageCategory(value as TemplateCategory);
              }}
              clearable
            />

            <MultiSelect
              label={t('Scenes')}
              data={sceneOptions}
              value={manageScenes}
              onChange={(value) => {
                setManagePage(1);
                setManageScenes(value as TemplateScene[]);
              }}
            />

            {canManageSettings && (
              <TagsInput
                label={t('Statuses')}
                value={manageStatuses}
                onChange={(value) => {
                  setManagePage(1);
                  setManageStatuses(value.filter((it) => ['draft', 'published', 'unpublished'].includes(it)));
                }}
                data={['draft', 'published', 'unpublished']}
              />
            )}
          </Group>

          <Table.ScrollContainer minWidth={1000}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('Name')}</Table.Th>
                  <Table.Th>{t('Category')}</Table.Th>
                  <Table.Th>{t('Scenes')}</Table.Th>
                  <Table.Th>{t('Status')}</Table.Th>
                  <Table.Th>{t('Updated at')}</Table.Th>
                  <Table.Th>{t('Actions')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(manageQuery.data?.items || []).map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>{item.name}</Table.Td>
                    <Table.Td>{getTemplateCategoryLabel(item.category)}</Table.Td>
                    <Table.Td>
                      {(item.scenes || []).map((scene) => getTemplateSceneLabel(scene)).join(', ')}
                    </Table.Td>
                    <Table.Td>
                      <TemplateStatusBadge status={item.status} />
                    </Table.Td>
                    <Table.Td>{new Date(item.updatedAt).toLocaleString()}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button
                          component={Link}
                          to={`/s/${spaceSlug}/templates/${item.id}/preview`}
                          size="xs"
                          variant="light"
                        >
                          {t('Preview')}
                        </Button>

                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => {
                            setEditingTemplate(item);
                            metaHandlers.open();
                          }}
                        >
                          {t('Edit')}
                        </Button>

                        {canManageSettings && item.status !== 'published' && (
                          <Button
                            size="xs"
                            color="green"
                            onClick={() => handlePublish(item.id)}
                            loading={publishMutation.isPending}
                          >
                            {t('Publish')}
                          </Button>
                        )}

                        {canManageSettings && item.status === 'published' && (
                          <Button
                            size="xs"
                            color="yellow"
                            onClick={() => handleUnpublish(item.id)}
                            loading={unpublishMutation.isPending}
                          >
                            {t('Unpublish')}
                          </Button>
                        )}

                        <Button
                          size="xs"
                          color="red"
                          onClick={() => handleDelete(item.id)}
                          loading={deleteMutation.isPending}
                        >
                          {t('Delete')}
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>

          {manageQuery.data?.items?.length === 0 && (
            <Text ta="center" c="dimmed" py="xl">
              {t('No results found...')}
            </Text>
          )}

          {manageQuery.data && (
            <Paginate
              currentPage={managePage}
              hasPrevPage={manageQuery.data.meta.hasPrevPage}
              hasNextPage={manageQuery.data.meta.hasNextPage}
              onPageChange={setManagePage}
            />
          )}
        </Tabs.Panel>
      </Tabs>

      <TemplateMetaModal
        opened={metaOpened}
        onClose={metaHandlers.close}
        template={editingTemplate}
        spaceId={space.id}
        canManageRecommendation={canManageSettings}
      />
    </Stack>
  );
}
