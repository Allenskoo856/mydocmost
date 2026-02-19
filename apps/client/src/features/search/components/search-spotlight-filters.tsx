import React, { useState, useMemo, useEffect } from "react";
import {
  Button,
  Menu,
  Text,
  TextInput,
  Divider,
  Badge,
  ScrollArea,
  Avatar,
  Group,
  Switch,
  getDefaultZIndex,
  MultiSelect,
  TagsInput,
} from "@mantine/core";
import {
  IconChevronDown,
  IconBuilding,
  IconFileDescription,
  IconSearch,
  IconCheck,
  IconSparkles,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useDebouncedValue } from "@mantine/hooks";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { useSpacePagePropertyStatusConfigQuery } from "@/features/space/queries/space-query";
import { useLicense } from "@/ee/hooks/use-license";
import classes from "./search-spotlight-filters.module.css";
import { isCloud } from "@/lib/config.ts";
import { useAtom } from "jotai/index";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";

interface SearchSpotlightFiltersProps {
  onFiltersChange?: (filters: any) => void;
  onAskClick?: () => void;
  spaceId?: string;
  isAiMode?: boolean;
}

export function SearchSpotlightFilters({
  onFiltersChange,
  onAskClick,
  spaceId,
  isAiMode = false,
}: SearchSpotlightFiltersProps) {
  const { t } = useTranslation();
  const { hasLicenseKey } = useLicense();
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(
    spaceId || null,
  );
  const [spaceSearchQuery, setSpaceSearchQuery] = useState("");
  const [debouncedSpaceQuery] = useDebouncedValue(spaceSearchQuery, 300);
  const [contentType, setContentType] = useState<string | null>("page");
  const [status, setStatus] = useState<string[]>([]);
  const [priority, setPriority] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const [dueFrom, setDueFrom] = useState<string>("");
  const [dueTo, setDueTo] = useState<string>("");
  const [workspace] = useAtom(workspaceAtom);
  const effectiveSpaceId = selectedSpaceId || spaceId || undefined;
  const { data: statusConfig } =
    useSpacePagePropertyStatusConfigQuery(effectiveSpaceId);

  const { data: spacesData } = useGetSpacesQuery({
    page: 1,
    limit: 100,
    query: debouncedSpaceQuery,
  });

  const selectedSpaceData = useMemo(() => {
    if (!spacesData?.items || !selectedSpaceId) return null;
    return spacesData.items.find((space) => space.id === selectedSpaceId);
  }, [spacesData?.items, selectedSpaceId]);

  const availableSpaces = useMemo(() => {
    const spaces = spacesData?.items || [];
    if (!selectedSpaceId) return spaces;

    // Sort to put selected space first
    return [...spaces].sort((a, b) => {
      if (a.id === selectedSpaceId) return -1;
      if (b.id === selectedSpaceId) return 1;
      return 0;
    });
  }, [spacesData?.items, selectedSpaceId]);

  useEffect(() => {
    if (onFiltersChange) {
      onFiltersChange({
        spaceId: selectedSpaceId,
        contentType,
        status,
        priority,
        tags,
        ownerIds,
        dueRange: {
          from: dueFrom || undefined,
          to: dueTo || undefined,
        },
      });
    }
  }, []);

  const contentTypeOptions = [
    { value: "page", label: t("Pages") },
    {
      value: "attachment",
      label: t("Attachments"),
      disabled: !isCloud() && !hasLicenseKey,
    },
  ];

  const handleSpaceSelect = (spaceId: string | null) => {
    setSelectedSpaceId(spaceId);

    if (onFiltersChange) {
      onFiltersChange({
        spaceId: spaceId,
        contentType,
        status,
        priority,
        tags,
        ownerIds,
        dueRange: {
          from: dueFrom || undefined,
          to: dueTo || undefined,
        },
      });
    }
  };

  const handleFilterChange = (filterType: string, value: any) => {
    let newSelectedSpaceId = selectedSpaceId;
    let newContentType = contentType;

    switch (filterType) {
      case "spaceId":
        newSelectedSpaceId = value;
        setSelectedSpaceId(value);
        break;
      case "contentType":
        newContentType = value;
        setContentType(value);
        break;
    }

    if (onFiltersChange) {
      onFiltersChange({
        spaceId: newSelectedSpaceId,
        contentType: newContentType,
        status,
        priority,
        tags,
        ownerIds,
        dueRange: {
          from: dueFrom || undefined,
          to: dueTo || undefined,
        },
      });
    }
  };

  const handlePropertyFilterChange = (next: {
    status?: string[];
    priority?: string[];
    tags?: string[];
    ownerIds?: string[];
    dueFrom?: string;
    dueTo?: string;
  }) => {
    const nextStatus = next.status ?? status;
    const nextPriority = next.priority ?? priority;
    const nextTags = next.tags ?? tags;
    const nextOwnerIds = next.ownerIds ?? ownerIds;
    const nextDueFrom = next.dueFrom ?? dueFrom;
    const nextDueTo = next.dueTo ?? dueTo;

    setStatus(nextStatus);
    setPriority(nextPriority);
    setTags(nextTags);
    setOwnerIds(nextOwnerIds);
    setDueFrom(nextDueFrom);
    setDueTo(nextDueTo);

    if (onFiltersChange) {
      onFiltersChange({
        spaceId: selectedSpaceId,
        contentType,
        status: nextStatus,
        priority: nextPriority,
        tags: nextTags,
        ownerIds: nextOwnerIds,
        dueRange: {
          from: nextDueFrom || undefined,
          to: nextDueTo || undefined,
        },
      });
    }
  };

  return (
    <div className={classes.filtersContainer}>
      {workspace?.settings?.ai?.search === true && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: "32px",
            paddingLeft: "8px",
            paddingRight: "8px",
          }}
        >
          <Switch
            checked={isAiMode}
            onChange={(event) => onAskClick()}
            label={t("Ask AI")}
            size="sm"
            color="blue"
            labelPosition="left"
            styles={{
              root: { display: "flex", alignItems: "center" },
              label: { paddingRight: "8px", fontSize: "13px", fontWeight: 500 },
            }}
          />
        </div>
      )}

      <Menu
        shadow="md"
        width={250}
        position="bottom-start"
        zIndex={getDefaultZIndex("max")}
      >
        <Menu.Target>
          <Button
            variant="subtle"
            color="gray"
            size="sm"
            rightSection={<IconChevronDown size={14} />}
            leftSection={<IconBuilding size={16} />}
            className={classes.filterButton}
            fw={500}
          >
            {selectedSpaceId
              ? `${t("Space")}: ${selectedSpaceData?.name || t("Unknown")}`
              : `${t("Space")}: ${t("All spaces")}`}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <TextInput
            placeholder={t("Find a space")}
            data-autofocus
            autoFocus
            leftSection={<IconSearch size={16} />}
            value={spaceSearchQuery}
            onChange={(e) => setSpaceSearchQuery(e.target.value)}
            size="sm"
            variant="filled"
            radius="sm"
            styles={{ input: { marginBottom: 8 } }}
          />

          <ScrollArea.Autosize mah={280}>
            <Menu.Item onClick={() => handleSpaceSelect(null)}>
              <Group flex="1" gap="xs">
                <Avatar
                  color="initials"
                  variant="filled"
                  name={t("All spaces")}
                  size={20}
                />
                <div style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>
                    {t("All spaces")}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t("Search in all your spaces")}
                  </Text>
                </div>
                {!selectedSpaceId && <IconCheck size={20} />}
              </Group>
            </Menu.Item>

            <Divider my="xs" />

            {availableSpaces.map((space) => (
              <Menu.Item
                key={space.id}
                onClick={() => handleSpaceSelect(space.id)}
              >
                <Group flex="1" gap="xs">
                  <Avatar
                    color="initials"
                    variant="filled"
                    name={space.name}
                    size={20}
                  />
                  <Text size="sm" fw={500} style={{ flex: 1 }} truncate>
                    {space.name}
                  </Text>
                  {selectedSpaceId === space.id && <IconCheck size={20} />}
                </Group>
              </Menu.Item>
            ))}
          </ScrollArea.Autosize>
        </Menu.Dropdown>
      </Menu>

      <Menu
        shadow="md"
        width={220}
        position="bottom-start"
        zIndex={getDefaultZIndex("max")}
      >
        <Menu.Target>
          <Button
            variant="subtle"
            color="gray"
            size="sm"
            rightSection={<IconChevronDown size={14} />}
            leftSection={<IconFileDescription size={16} />}
            className={classes.filterButton}
            fw={500}
          >
            {contentType
              ? `${t("Type")}: ${contentTypeOptions.find((opt) => opt.value === contentType)?.label || t(contentType === "page" ? "Pages" : "Attachments")}`
              : t("Type")}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {contentTypeOptions.map((option) => (
            <Menu.Item
              key={option.value}
              onClick={() =>
                !option.disabled &&
                contentType !== option.value &&
                handleFilterChange("contentType", option.value)
              }
              disabled={option.disabled || (isAiMode && option.value === "attachment")}
            >
              <Group flex="1" gap="xs">
                <div>
                  <Text size="sm">{option.label}</Text>
                  {option.disabled && (
                    <Badge size="xs" mt={4}>
                      {t("Enterprise")}
                    </Badge>
                  )}
                  {!option.disabled && isAiMode && option.value === "attachment" && (
                    <Text size="xs" mt={4}>
                      {t("Ask AI not available for attachments")}
                    </Text>
                  )}
                </div>
                {contentType === option.value && <IconCheck size={20} />}
              </Group>
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>

      <MultiSelect
        value={status}
        onChange={(value) => handlePropertyFilterChange({ status: value })}
        data={(statusConfig?.statusOptions || []).map((value) => ({
          value,
          label: value,
        }))}
        placeholder={t("Status")}
        size="xs"
        w={180}
      />

      <MultiSelect
        value={priority}
        onChange={(value) => handlePropertyFilterChange({ priority: value })}
        data={["P0", "P1", "P2", "P3"].map((value) => ({
          value,
          label: value,
        }))}
        placeholder={t("Priority")}
        size="xs"
        w={130}
      />

      <TagsInput
        value={tags}
        onChange={(value) => handlePropertyFilterChange({ tags: value })}
        placeholder={t("Tags")}
        size="xs"
        w={180}
      />

      <TagsInput
        value={ownerIds}
        onChange={(value) =>
          handlePropertyFilterChange({ ownerIds: value })
        }
        placeholder={t("Owner IDs")}
        size="xs"
        w={180}
      />

      <TextInput
        type="datetime-local"
        value={dueFrom}
        onChange={(e) =>
          handlePropertyFilterChange({ dueFrom: e.currentTarget.value })
        }
        size="xs"
        w={180}
        placeholder={t("Due from")}
      />

      <TextInput
        type="datetime-local"
        value={dueTo}
        onChange={(e) =>
          handlePropertyFilterChange({ dueTo: e.currentTarget.value })
        }
        size="xs"
        w={180}
        placeholder={t("Due to")}
      />
    </div>
  );
}
