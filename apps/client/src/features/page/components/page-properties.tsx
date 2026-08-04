import {
  ActionIcon,
  Avatar,
  Box,
  Group,
  Loader,
  Menu,
  Popover,
  Select,
  Stack,
  TagsInput,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useDebouncedCallback, useDebouncedValue } from "@mantine/hooks";
import {
  IconCalendar,
  IconCircleDot,
  IconFlag,
  IconPlus,
  IconTag,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  usePagePropertyTagsQuery,
  usePageQuery,
  useUpdatePageMutation,
} from "@/features/page/queries/page-query";
import {
  useSpacePagePropertyOwnersQuery,
  useSpacePagePropertyStatusConfigQuery,
} from "@/features/space/queries/space-query";
import {
  PAGE_PROPERTY_KEYS,
  PagePropertyKey,
} from "@/features/space/types/space.types";
import { IPage } from "@/features/page/types/page.types";
import { queryClient } from "@/main.tsx";
import classes from "./page-properties.module.css";

interface PagePropertiesProps {
  pageId: string;
  spaceId: string;
  editable: boolean;
}

const priorityOptions = ["P0", "P1", "P2", "P3"] as const;

const propertyLabels: Record<PagePropertyKey, string> = {
  tags: "Tags",
  owner: "Owner",
  status: "Status",
  priority: "Priority",
  dueAt: "Due time",
};

const propertyIcons: Record<PagePropertyKey, typeof IconTag> = {
  tags: IconTag,
  owner: IconUser,
  status: IconCircleDot,
  priority: IconFlag,
  dueAt: IconCalendar,
};

function getErrorMessage(error: unknown, fallback: string) {
  const responseMessage = (error as any)?.response?.data?.message;
  if (typeof responseMessage === "string") return responseMessage;
  if (responseMessage?.message) return responseMessage.message;
  return error instanceof Error ? error.message : fallback;
}

export default function PageProperties({
  pageId,
  spaceId,
  editable,
}: PagePropertiesProps) {
  const { t } = useTranslation();
  const { data: page } = usePageQuery({ pageId });
  const { data: config } = useSpacePagePropertyStatusConfigQuery(spaceId);
  const { data: spaceTags = [] } = usePagePropertyTagsQuery(spaceId);
  const updatePageMutation = useUpdatePageMutation();
  const [activeProperty, setActiveProperty] = useState<PagePropertyKey | null>(
    null,
  );
  // Track saving state per property so one field saving never blocks another.
  const [savingProperties, setSavingProperties] = useState<
    Set<PagePropertyKey>
  >(new Set());
  const [ownerSearch, setOwnerSearch] = useState("");
  const [debouncedOwnerSearch] = useDebouncedValue(ownerSearch, 250);
  const { data: ownerResults } = useSpacePagePropertyOwnersQuery(
    spaceId,
    debouncedOwnerSearch,
  );
  const [tagDraft, setTagDraft] = useState<string[]>([]);

  const enabledProperties = config?.enabledProperties ?? PAGE_PROPERTY_KEYS;
  const enabledSet = useMemo(
    () => new Set<PagePropertyKey>(enabledProperties),
    [enabledProperties],
  );

  const tagSuggestions = useMemo(() => {
    // Prefer parent-page tags (read from cache, no extra request), then the
    // space's high-frequency tags. Case-insensitive de-duplication, first
    // casing wins.
    const parent = page?.parentPageId
      ? queryClient.getQueryData<IPage>(["pages", page.parentPageId])
      : undefined;
    const parentTags = parent?.propertyTags ?? [];
    const seen = new Set<string>();
    return [...parentTags, ...spaceTags].filter((tag) => {
      const key = tag.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [page?.parentPageId, spaceTags]);

  const ownerOptions = useMemo(
    () =>
      (ownerResults?.items ?? []).map((owner) => ({
        value: owner.id,
        label: owner.name || owner.email || owner.id,
      })),
    [ownerResults?.items],
  );

  useEffect(() => {
    if (activeProperty === "tags") {
      setTagDraft(page?.propertyTags ?? []);
    }
  }, [activeProperty, page?.propertyTags]);

  const isSaving = (property: PagePropertyKey) =>
    savingProperties.has(property);

  const setSaving = (property: PagePropertyKey, saving: boolean) => {
    setSavingProperties((prev) => {
      const next = new Set(prev);
      if (saving) next.add(property);
      else next.delete(property);
      return next;
    });
  };

  const saveField = async (
    property: PagePropertyKey,
    payload: Record<string, unknown>,
    close = true,
  ) => {
    if (!editable || isSaving(property)) return;
    setSaving(property, true);
    try {
      await updatePageMutation.mutateAsync({ pageId, ...payload });
      if (close) setActiveProperty(null);
    } catch (error) {
      // Restore the last known server value so the UI never shows a fake
      // success. Controlled editors read straight from the page cache; only
      // the local tag draft needs an explicit reset.
      if (property === "tags") setTagDraft(page?.propertyTags ?? []);
      notifications.show({
        color: "red",
        message: getErrorMessage(error, t("Failed to update page property")),
      });
    } finally {
      setSaving(property, false);
    }
  };

  const saveTags = useDebouncedCallback((tags: string[]) => {
    void saveField("tags", { tags }, false);
  }, 350);

  if (!page) return null;

  const propertyHasValue: Record<PagePropertyKey, boolean> = {
    owner: Boolean(page.propertyOwnerId),
    status: Boolean(page.propertyStatus),
    priority: Boolean(page.propertyPriority),
    dueAt: Boolean(page.propertyDueAt),
    tags: Boolean(page.propertyTags?.length),
  };

  const visibleProperties = PAGE_PROPERTY_KEYS.filter(
    (key) => enabledSet.has(key) && propertyHasValue[key],
  );
  const addableProperties = PAGE_PROPERTY_KEYS.filter(
    (key) => enabledSet.has(key) && !propertyHasValue[key],
  );

  // When a currently-empty property is being edited (opened from "+ property"),
  // render its chip too so the editor popover has an anchor to attach to.
  const editingAddable =
    activeProperty && addableProperties.includes(activeProperty)
      ? activeProperty
      : null;
  const chipProperties = editingAddable
    ? [...visibleProperties, editingAddable]
    : visibleProperties;

  if (!editable && visibleProperties.length === 0) return null;

  const clearProperty = (property: PagePropertyKey) => {
    const payload = property === "tags" ? { tags: [] } : { [property]: null };
    void saveField(property, payload);
  };

  const formatDueAt = (value: Date | string) =>
    new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));

  const getPropertyLabel = (property: PagePropertyKey) => {
    switch (property) {
      case "owner":
        return (
          page.propertyOwner?.name ||
          (page.propertyOwnerId === page.creatorId
            ? page.creator?.name
            : page.propertyOwnerId?.slice(0, 8)) ||
          t("Owner")
        );
      case "status":
        return page.propertyStatus || t("Status");
      case "priority":
        return page.propertyPriority || t("Priority");
      case "dueAt":
        return page.propertyDueAt
          ? formatDueAt(page.propertyDueAt)
          : t("Due time");
      case "tags":
        return (page.propertyTags ?? []).join(" · ") || t("Tags");
    }
  };

  const renderEditor = (property: PagePropertyKey) => {
    if (property === "owner") {
      return (
        <Select
          searchable
          clearable
          autoFocus
          data={ownerOptions}
          value={page.propertyOwnerId ?? null}
          searchValue={ownerSearch}
          onSearchChange={setOwnerSearch}
          onChange={(value) => void saveField("owner", { ownerId: value })}
          placeholder={t("Search space members")}
          nothingFoundMessage={t("No space member found")}
          disabled={isSaving("owner")}
        />
      );
    }

    if (property === "status") {
      return (
        <Select
          clearable
          autoFocus
          data={(config?.statusOptions ?? []).map((value) => ({
            value,
            label: value,
          }))}
          value={page.propertyStatus ?? null}
          onChange={(value) => void saveField("status", { status: value })}
          placeholder={t("Select status")}
          disabled={isSaving("status")}
        />
      );
    }

    if (property === "priority") {
      return (
        <Select
          clearable
          autoFocus
          data={priorityOptions.map((value) => ({ value, label: value }))}
          value={page.propertyPriority ?? null}
          onChange={(value) => void saveField("priority", { priority: value })}
          placeholder={t("Select priority")}
          disabled={isSaving("priority")}
        />
      );
    }

    if (property === "dueAt") {
      return (
        <DateTimePicker
          clearable
          autoFocus
          value={page.propertyDueAt ? new Date(page.propertyDueAt) : null}
          onChange={(value) =>
            void saveField("dueAt", {
              dueAt: value ? new Date(value).toISOString() : null,
            })
          }
          placeholder={t("Select due time")}
          disabled={isSaving("dueAt")}
        />
      );
    }

    return (
      <TagsInput
        autoFocus
        value={tagDraft}
        data={tagSuggestions}
        maxTags={50}
        onChange={(tags) => {
          setTagDraft(tags);
          saveTags(tags);
        }}
        onBlur={() => setActiveProperty(null)}
        placeholder={t("Add tags")}
        disabled={isSaving("tags")}
      />
    );
  };

  const renderProperty = (property: PagePropertyKey) => {
    const Icon = propertyIcons[property];
    const hasValue = propertyHasValue[property];
    const muted =
      property === "owner" && page.propertyOwnerId === page.creatorId;

    return (
      <Popover
        key={property}
        opened={editable && activeProperty === property}
        onChange={(opened) => setActiveProperty(opened ? property : null)}
        position="bottom-start"
        shadow="md"
        width="target"
      >
        <Popover.Target>
          <Box
            className={`${classes.property} ${muted ? classes.propertyMuted : ""}`}
          >
            <UnstyledButton
              className={classes.propertyButton}
              onClick={() => editable && setActiveProperty(property)}
              disabled={!editable}
            >
              {property === "owner" && page.propertyOwnerId ? (
                <Avatar
                  size={17}
                  src={page.propertyOwner?.avatarUrl}
                  name={getPropertyLabel(property)}
                />
              ) : (
                <Icon size={14} stroke={1.8} />
              )}
              <Text component="span" size="xs" truncate maw={260}>
                {getPropertyLabel(property)}
              </Text>
              {isSaving(property) && <Loader size={11} />}
            </UnstyledButton>
            {editable && hasValue && (
              <ActionIcon
                className={classes.clearButton}
                variant="subtle"
                size={20}
                aria-label={t("Clear {{property}}", {
                  property: t(propertyLabels[property]),
                })}
                onClick={() => clearProperty(property)}
                disabled={isSaving(property)}
              >
                <IconX size={11} />
              </ActionIcon>
            )}
          </Box>
        </Popover.Target>
        <Popover.Dropdown className={classes.editor}>
          <Stack gap={8}>
            <Text size="xs" fw={600} c="dimmed">
              {t(propertyLabels[property])}
            </Text>
            {renderEditor(property)}
          </Stack>
        </Popover.Dropdown>
      </Popover>
    );
  };

  if (chipProperties.length === 0 && addableProperties.length === 0) {
    return null;
  }

  return (
    <div className={classes.root} aria-label={t("Page properties")}>
      {chipProperties.map(renderProperty)}

      {editable && addableProperties.length > 0 && (
        <Menu position="bottom-start" shadow="md">
          <Menu.Target>
            <UnstyledButton className={classes.addButton}>
              <Group gap={4} wrap="nowrap">
                <IconPlus size={14} />
                <span>{t("Add property")}</span>
              </Group>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{t("Properties")}</Menu.Label>
            {addableProperties.map((property) => {
              const Icon = propertyIcons[property];
              return (
                <Menu.Item
                  key={property}
                  leftSection={<Icon size={15} />}
                  onClick={() => setActiveProperty(property)}
                >
                  {t(propertyLabels[property])}
                </Menu.Item>
              );
            })}
          </Menu.Dropdown>
        </Menu>
      )}
    </div>
  );
}
