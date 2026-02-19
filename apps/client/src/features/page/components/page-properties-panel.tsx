import {
  ActionIcon,
  Group,
  Select,
  TagsInput,
  Text,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { usePageQuery, usePagePropertyTagsQuery, useUpdatePageMutation } from "@/features/page/queries/page-query";
import { useSpacePagePropertyStatusConfigQuery } from "@/features/space/queries/space-query.ts";
import { useSearchSuggestionsQuery } from "@/features/search/queries/search-query.ts";
import { useTranslation } from "react-i18next";

interface PagePropertiesPanelProps {
  pageId: string;
  spaceId: string;
  editable: boolean;
}

const priorityOptions = ["P0", "P1", "P2", "P3"];

export default function PagePropertiesPanel({
  pageId,
  spaceId,
  editable,
}: PagePropertiesPanelProps) {
  const { t } = useTranslation();
  const [opened, { toggle }] = useDisclosure(true);
  const { data: page } = usePageQuery({ pageId });
  const { data: statusConfig } = useSpacePagePropertyStatusConfigQuery(spaceId);
  const { data: tagSuggestions = [] } = usePagePropertyTagsQuery(spaceId);
  const updatePageMutation = useUpdatePageMutation();

  const [ownerQuery, setOwnerQuery] = useState("");
  const { data: ownerSuggestions } = useSearchSuggestionsQuery({
    query: ownerQuery,
    includeUsers: true,
    limit: 20,
  });

  const ownerOptions = useMemo(() => {
    const users = ownerSuggestions?.users || [];
    return users.map((user: any) => ({
      value: user.id,
      label: user.name || user.email || user.id,
    }));
  }, [ownerSuggestions?.users]);

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    if (!page) return;
    setOwnerId(page.propertyOwnerId || null);
    setStatus(page.propertyStatus || null);
    setPriority(page.propertyPriority || null);
    setDueAt(page.propertyDueAt ? new Date(page.propertyDueAt).toISOString() : null);
    setTags(page.propertyTags || []);
  }, [page?.id, page?.propertyOwnerId, page?.propertyStatus, page?.propertyPriority, page?.propertyDueAt, page?.propertyTags]);

  const saveField = async (payload: Record<string, any>) => {
    if (!editable) return;
    await updatePageMutation.mutateAsync({
      pageId,
      ...payload,
    });
  };

  return (
    <div style={{ marginBottom: 12, border: "1px solid var(--mantine-color-default-border)", borderRadius: 8, padding: 10 }}>
      <Group justify="space-between" mb={opened ? "sm" : 0}>
        <Text fw={600} size="sm">
          {t("Page properties")}
        </Text>
        <ActionIcon variant="subtle" onClick={toggle} aria-label={t("Toggle page properties")}>
          {opened ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </ActionIcon>
      </Group>

      {opened && (
        <Group grow align="flex-end">
          <Select
            label={t("Owner")}
            searchable
            data={ownerOptions}
            value={ownerId}
            onSearchChange={setOwnerQuery}
            onChange={(value) => {
              setOwnerId(value);
              if (value) {
                saveField({ ownerId: value });
              }
            }}
            disabled={!editable}
            placeholder={t("Select owner")}
          />

          <Select
            label={t("Status")}
            data={(statusConfig?.statusOptions || []).map((value) => ({ value, label: value }))}
            value={status}
            onChange={(value) => {
              setStatus(value);
              if (value) {
                saveField({ status: value });
              }
            }}
            disabled={!editable}
            placeholder={t("Select status")}
          />

          <Select
            label={t("Priority")}
            data={priorityOptions.map((value) => ({ value, label: value }))}
            value={priority}
            onChange={(value) => {
              setPriority(value);
              if (value) {
                saveField({ priority: value });
              }
            }}
            disabled={!editable}
            placeholder={t("Select priority")}
          />

          <DateTimePicker
            label={t("Due time")}
            value={dueAt ? new Date(dueAt) : null}
            onChange={(value) => {
              const next = value ? new Date(value).toISOString() : null;
              setDueAt(next);
              if (next) {
                saveField({ dueAt: next });
              }
            }}
            disabled={!editable}
          />

          <TagsInput
            label={t("Tags")}
            value={tags}
            onChange={setTags}
            onBlur={() => saveField({ tags })}
            data={tagSuggestions}
            disabled={!editable}
            placeholder={t("Add tags")}
          />
        </Group>
      )}
    </div>
  );
}
