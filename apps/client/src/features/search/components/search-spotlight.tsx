import { Spotlight } from "@mantine/spotlight";
import { IconSearch } from "@tabler/icons-react";
import React, { useMemo, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { Text } from "@mantine/core";
import { searchSpotlightStore } from "../constants.ts";
import { SearchSpotlightFilters } from "./search-spotlight-filters.tsx";
import { useUnifiedSearch } from "../hooks/use-unified-search.ts";
import { SearchResultItem } from "./search-result-item.tsx";
import { isCloud } from "@/lib/config.ts";
import {
  filterCommands,
  useCommandPaletteActions,
} from "@/features/search/hooks/use-command-palette-actions";
import type { CommandGroupId } from "@/features/search/commands/types";

interface SearchSpotlightProps {
  spaceId?: string;
}

const GROUP_ORDER: CommandGroupId[] = ["page", "agent", "navigation"];

function formatShortcut(shortcut: string): string {
  const isApple =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
  const mod = isApple ? "⌘" : "Ctrl";
  return shortcut.replace(/Mod\+/gi, `${mod}+`);
}

export function SearchSpotlight({ spaceId }: SearchSpotlightProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debouncedSearchQuery] = useDebouncedValue(query, 300);
  const commands = useCommandPaletteActions();
  const filteredCommands = useMemo(
    () => filterCommands(commands, query),
    [commands, query],
  );
  const [filters, setFilters] = useState<{
    spaceId?: string | null;
    contentType?: string;
    status?: string[];
    priority?: string[];
    tags?: string[];
    ownerIds?: string[];
    dueRange?: {
      from?: string;
      to?: string;
    };
  }>({
    contentType: "page",
  });

  const searchParams = useMemo(() => {
    const params: any = {
      query: debouncedSearchQuery,
      contentType: filters.contentType || "page",
    };

    if (filters.spaceId) {
      params.spaceId = filters.spaceId;
    }
    if (filters.status?.length) {
      params.status = filters.status;
    }
    if (filters.priority?.length) {
      params.priority = filters.priority;
    }
    if (filters.tags?.length) {
      params.tags = filters.tags;
    }
    if (filters.ownerIds?.length) {
      params.ownerIds = filters.ownerIds;
    }
    if (filters.dueRange?.from || filters.dueRange?.to) {
      params.dueRange = filters.dueRange;
    }

    return params;
  }, [debouncedSearchQuery, filters]);

  const { data: searchResults, isLoading } = useUnifiedSearch(searchParams);

  const isAttachmentSearch =
    filters.contentType === "attachment" && isCloud();

  const resultItems = (searchResults || []).map((result) => (
    <SearchResultItem
      key={result.id}
      result={result}
      isAttachmentResult={isAttachmentSearch}
      showSpace={!filters.spaceId}
    />
  ));

  const handleFiltersChange = (newFilters: any) => {
    setFilters(newFilters);
  };

  const groupLabel = (group: CommandGroupId) => {
    switch (group) {
      case "page":
        return t("Page actions");
      case "agent":
        return t("Agent");
      case "navigation":
        return t("Navigation");
      default:
        return group;
    }
  };

  const hasQuery = query.trim().length > 0;
  const showSearchSection = hasQuery;
  const showCommandSection = filteredCommands.length > 0;
  const noResults =
    hasQuery &&
    !isLoading &&
    filteredCommands.length === 0 &&
    resultItems.length === 0;

  return (
    <>
      <Spotlight.Root
        size="xl"
        maxHeight={600}
        store={searchSpotlightStore}
        query={query}
        onQueryChange={setQuery}
        scrollable
        overlayProps={{
          backgroundOpacity: 0.55,
        }}
      >
        <Spotlight.Search
          placeholder={t("Search pages or type a command...")}
          leftSection={<IconSearch size={20} stroke={1.5} />}
          px="sm"
          pt="sm"
          pb="xs"
        />

        {hasQuery && (
          <div
            style={{
              padding: "4px 16px",
            }}
          >
            <SearchSpotlightFilters
              onFiltersChange={handleFiltersChange}
              spaceId={spaceId}
            />
          </div>
        )}

        <Spotlight.ActionsList>
          {!hasQuery && filteredCommands.length === 0 && (
            <Spotlight.Empty>
              {t("Type to search pages or run a command")}
            </Spotlight.Empty>
          )}

          {showCommandSection &&
            GROUP_ORDER.map((group) => {
              const items = filteredCommands.filter(
                (command) => command.group === group,
              );
              if (items.length === 0) {
                return null;
              }

              return (
                <Spotlight.ActionsGroup label={groupLabel(group)} key={group}>
                  {items.map((command) => (
                    <Spotlight.Action
                      key={command.id}
                      label={command.label}
                      description={command.description}
                      keywords={command.keywords}
                      leftSection={command.icon}
                      rightSection={
                        command.shortcut ? (
                          <Text size="xs" c="dimmed">
                            {formatShortcut(command.shortcut)}
                          </Text>
                        ) : undefined
                      }
                      onClick={() => {
                        void command.perform();
                      }}
                    />
                  ))}
                </Spotlight.ActionsGroup>
              );
            })}

          {showSearchSection && resultItems.length > 0 && (
            <Spotlight.ActionsGroup label={t("Pages")}>
              {resultItems}
            </Spotlight.ActionsGroup>
          )}

          {showSearchSection &&
            !isLoading &&
            resultItems.length === 0 &&
            filteredCommands.length > 0 && (
              <Spotlight.Empty>{t("No page results...")}</Spotlight.Empty>
            )}

          {noResults && (
            <Spotlight.Empty>{t("No results found...")}</Spotlight.Empty>
          )}
        </Spotlight.ActionsList>
      </Spotlight.Root>
    </>
  );
}
