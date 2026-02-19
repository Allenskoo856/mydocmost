import {
  Button,
  Checkbox,
  Group,
  MultiSelect,
  Select,
  Table,
  TagsInput,
  Text,
  TextInput,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useMemo, useState } from "react";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { useParams } from "react-router-dom";
import {
  useBatchUpdatePagePropertiesMutation,
  usePageManageListQuery,
  usePagePropertyTagsQuery,
} from "@/features/page/queries/page-query.ts";
import { useSpacePagePropertyStatusConfigQuery } from "@/features/space/queries/space-query.ts";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import Paginate from "@/components/common/paginate.tsx";
import { usePaginateAndSearch } from "@/hooks/use-paginate-and-search.tsx";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { Link } from "react-router-dom";

const priorityOptions = ["P0", "P1", "P2", "P3"];

export default function SpacePageManage() {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const { page, setPage } = usePaginateAndSearch();
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [tagsFilter, setTagsFilter] = useState<string[]>([]);
  const [ownerIdsFilter, setOwnerIdsFilter] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [batchPriority, setBatchPriority] = useState<string | null>(null);
  const [batchDueAt, setBatchDueAt] = useState<string | null>(null);
  const [batchTags, setBatchTags] = useState<string[]>([]);

  const { data: statusConfig } = useSpacePagePropertyStatusConfigQuery(space?.id);
  const { data: tagSuggestions = [] } = usePagePropertyTagsQuery(space?.id);

  const listParams = useMemo(() => {
    if (!space?.id) return null;
    return {
      spaceId: space.id,
      page,
      limit: 50,
      keyword,
      status: statusFilter.length ? statusFilter : undefined,
      priority: priorityFilter.length ? (priorityFilter as any) : undefined,
      tags: tagsFilter.length ? tagsFilter : undefined,
      ownerIds: ownerIdsFilter.length ? ownerIdsFilter : undefined,
      sortBy: "updatedAt" as const,
      sortOrder: "desc" as const,
    };
  }, [space?.id, page, keyword, statusFilter, priorityFilter, tagsFilter, ownerIdsFilter]);

  const { data: pageList, isLoading } = usePageManageListQuery(listParams);
  const batchMutation = useBatchUpdatePagePropertiesMutation();

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleAll = () => {
    const allIds = pageList?.items?.map((item) => item.id) || [];
    if (selectedIds.length === allIds.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(allIds);
  };

  const applyBatch = async () => {
    if (!space?.id || selectedIds.length === 0) return;

    const patch: Record<string, any> = {};
    if (batchStatus) patch.status = batchStatus;
    if (batchPriority) patch.priority = batchPriority;
    if (batchDueAt) patch.dueAt = batchDueAt;
    if (batchTags.length > 0) patch.tags = batchTags;

    if (Object.keys(patch).length === 0) {
      notifications.show({ message: t("Please choose at least one property"), color: "yellow" });
      return;
    }

    const result = await batchMutation.mutateAsync({
      spaceId: space.id,
      pageIds: selectedIds,
      patch,
    });

    notifications.show({
      message: t("Batch update done: {{ok}} success, {{failed}} failed", {
        ok: result.successCount,
        failed: result.failed.length,
      }),
    });
    setSelectedIds([]);
  };

  return (
    <div>
      <Group justify="space-between" mb="md">
        <Text fw={700} size="xl">
          {t("Page management")}
        </Text>
      </Group>

      <Group align="flex-end" mb="md">
        <TextInput
          label={t("Keyword")}
          value={keyword}
          onChange={(e) => setKeyword(e.currentTarget.value)}
          placeholder={t("Search title")}
        />
        <MultiSelect
          label={t("Status")}
          value={statusFilter}
          onChange={setStatusFilter}
          data={(statusConfig?.statusOptions || []).map((value) => ({ value, label: value }))}
        />
        <MultiSelect
          label={t("Priority")}
          value={priorityFilter}
          onChange={setPriorityFilter}
          data={priorityOptions.map((value) => ({ value, label: value }))}
        />
        <TagsInput
          label={t("Tags")}
          value={tagsFilter}
          onChange={setTagsFilter}
          data={tagSuggestions}
        />
        <TagsInput
          label={t("Owner IDs")}
          value={ownerIdsFilter}
          onChange={setOwnerIdsFilter}
          placeholder={t("Filter owner ids")}
        />
      </Group>

      <Group align="flex-end" mb="md">
        <Select
          label={t("Batch status")}
          data={(statusConfig?.statusOptions || []).map((value) => ({ value, label: value }))}
          value={batchStatus}
          onChange={setBatchStatus}
          placeholder={t("No change")}
        />
        <Select
          label={t("Batch priority")}
          data={priorityOptions.map((value) => ({ value, label: value }))}
          value={batchPriority}
          onChange={setBatchPriority}
          placeholder={t("No change")}
        />
        <DateTimePicker
          label={t("Batch due time")}
          value={batchDueAt ? new Date(batchDueAt) : null}
          onChange={(value) =>
            setBatchDueAt(value ? new Date(value).toISOString() : null)
          }
        />
        <TagsInput
          label={t("Batch tags")}
          value={batchTags}
          onChange={setBatchTags}
          data={tagSuggestions}
        />
        <Button
          onClick={applyBatch}
          disabled={selectedIds.length === 0}
          loading={batchMutation.isPending}
        >
          {t("Apply to selected ({{count}})", { count: selectedIds.length })}
        </Button>
      </Group>

      <Table.ScrollContainer minWidth={900}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>
                <Checkbox
                  checked={
                    (pageList?.items?.length || 0) > 0 &&
                    selectedIds.length === (pageList?.items?.length || 0)
                  }
                  onChange={toggleAll}
                />
              </Table.Th>
              <Table.Th>{t("Title")}</Table.Th>
              <Table.Th>{t("Status")}</Table.Th>
              <Table.Th>{t("Priority")}</Table.Th>
              <Table.Th>{t("Owner")}</Table.Th>
              <Table.Th>{t("Due time")}</Table.Th>
              <Table.Th>{t("Tags")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(pageList?.items || []).map((item) => (
              <Table.Tr key={item.id}>
                <Table.Td>
                  <Checkbox
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleOne(item.id)}
                  />
                </Table.Td>
                <Table.Td>
                  <Link to={buildPageUrl(spaceSlug, item.slugId, item.title)}>
                    {item.title || t("Untitled")}
                  </Link>
                </Table.Td>
                <Table.Td>{item.propertyStatus || "-"}</Table.Td>
                <Table.Td>{item.propertyPriority || "-"}</Table.Td>
                <Table.Td>{item.ownerName || "-"}</Table.Td>
                <Table.Td>
                  {item.propertyDueAt
                    ? new Date(item.propertyDueAt).toLocaleString()
                    : "-"}
                </Table.Td>
                <Table.Td>{(item.propertyTags || []).join(", ") || "-"}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {!isLoading && pageList?.items?.length === 0 && (
        <Text ta="center" c="dimmed" py="xl">
          {t("No results found...")}
        </Text>
      )}

      {pageList && pageList.items.length > 0 && (
        <Paginate
          currentPage={page}
          hasPrevPage={pageList.meta.hasPrevPage}
          hasNextPage={pageList.meta.hasNextPage}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
