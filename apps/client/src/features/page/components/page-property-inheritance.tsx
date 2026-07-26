import { Button, Group, Paper, Text } from "@mantine/core";
import { IconArrowDown } from "@tabler/icons-react";
import { useMemo } from "react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import {
  usePageQuery,
  useUpdatePageMutation,
} from "@/features/page/queries/page-query";
import { useSpacePagePropertyStatusConfigQuery } from "@/features/space/queries/space-query";
import { PAGE_PROPERTY_KEYS } from "@/features/space/types/space.types";
import { pageInheritanceSuggestionsAtom } from "@/features/page/atoms/page-property-inheritance-atom";

interface PagePropertyInheritanceProps {
  pageId: string;
  spaceId: string;
  editable: boolean;
}

export default function PagePropertyInheritance({
  pageId,
  spaceId,
  editable,
}: PagePropertyInheritanceProps) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useAtom(pageInheritanceSuggestionsAtom);
  const suggestion = suggestions[pageId];
  const { data: page } = usePageQuery({ pageId });
  const { data: config } = useSpacePagePropertyStatusConfigQuery(spaceId);
  const updatePageMutation = useUpdatePageMutation();

  const enabledSet = useMemo(
    () => new Set(config?.enabledProperties ?? PAGE_PROPERTY_KEYS),
    [config?.enabledProperties],
  );

  const removeSuggestion = () =>
    setSuggestions((prev) => {
      const next = { ...prev };
      delete next[pageId];
      return next;
    });

  // Owner is only suggestible when enabled and it differs from the current one.
  const ownerId =
    suggestion?.ownerId &&
    enabledSet.has("owner") &&
    page?.propertyOwnerId !== suggestion.ownerId
      ? suggestion.ownerId
      : undefined;

  // Tags are suggested only when enabled and not already present on the page.
  const remainingTags = useMemo(() => {
    if (!suggestion || !enabledSet.has("tags")) return [];
    const existing = new Set(
      (page?.propertyTags ?? []).map((tag) => tag.trim().toLowerCase()),
    );
    return suggestion.tags.filter(
      (tag) => !existing.has(tag.trim().toLowerCase()),
    );
  }, [suggestion, page?.propertyTags, enabledSet]);

  if (!editable || !suggestion) return null;
  if (!ownerId && remainingTags.length === 0) return null;

  const mergedTags = () => {
    const seen = new Set<string>();
    return [...(page?.propertyTags ?? []), ...remainingTags].filter((tag) => {
      const key = tag.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const apply = async (payload: Record<string, unknown>, done: () => void) => {
    try {
      await updatePageMutation.mutateAsync({ pageId, ...payload });
      done();
    } catch {
      notifications.show({
        color: "red",
        message: t("Failed to apply inherited properties"),
      });
    }
  };

  const adoptOwner = () =>
    apply({ ownerId }, () => {
      if (remainingTags.length === 0) removeSuggestion();
      else setSuggestions((prev) => ({
        ...prev,
        [pageId]: { ...prev[pageId], ownerId: undefined },
      }));
    });

  const adoptTags = () =>
    apply({ tags: mergedTags() }, () => {
      if (!ownerId) removeSuggestion();
      else setSuggestions((prev) => ({
        ...prev,
        [pageId]: { ...prev[pageId], tags: [] },
      }));
    });

  const adoptAll = () => {
    const payload: Record<string, unknown> = {};
    if (ownerId) payload.ownerId = ownerId;
    if (remainingTags.length > 0) payload.tags = mergedTags();
    void apply(payload, removeSuggestion);
  };

  const busy = updatePageMutation.isPending;

  return (
    <Paper withBorder radius="md" p="xs" mb="sm">
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap={6} wrap="nowrap">
          <IconArrowDown size={16} />
          <Text size="sm">{t("Inherit properties from the parent page?")}</Text>
        </Group>
        <Group gap="xs" wrap="wrap">
          {ownerId && (
            <Button
              size="compact-xs"
              variant="light"
              onClick={adoptOwner}
              disabled={busy}
            >
              {t("Set owner: {{name}}", {
                name: suggestion.ownerName || t("Parent owner"),
              })}
            </Button>
          )}
          {remainingTags.length > 0 && (
            <Button
              size="compact-xs"
              variant="light"
              onClick={adoptTags}
              disabled={busy}
            >
              {t("Add tags: {{tags}}", { tags: remainingTags.join(", ") })}
            </Button>
          )}
          <Button
            size="compact-xs"
            onClick={adoptAll}
            loading={busy}
          >
            {t("Adopt all")}
          </Button>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={removeSuggestion}
            disabled={busy}
          >
            {t("Ignore")}
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}
