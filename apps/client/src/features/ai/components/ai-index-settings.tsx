import { useState } from "react";
import { Button, Divider, Group, Progress, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import useUserRole from "@/hooks/use-user-role.tsx";
import { isAiEnabled } from "@/lib/config.ts";
import {
  getAiStatus,
  reindexWorkspace,
} from "@/features/ai/services/ai-service.ts";

/**
 * Admin-only card in workspace settings: shows how many pages are indexed for
 * AI and offers a one-click full rebuild (backfill) of embeddings.
 */
export default function AiIndexSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const [triggering, setTriggering] = useState(false);

  const { data: status, refetch } = useQuery({
    queryKey: ["ai", "status"],
    queryFn: getAiStatus,
    enabled: isAiEnabled() && isAdmin,
    // Poll while a rebuild is catching up, then stop.
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && d.enabled && d.indexedPages < d.totalPages ? 4000 : false;
    },
  });

  if (!isAiEnabled() || !isAdmin || !status?.enabled) {
    return null;
  }

  const { indexedPages, totalPages } = status;
  const pct =
    totalPages > 0 ? Math.round((indexedPages / totalPages) * 100) : 0;

  const handleReindex = async () => {
    setTriggering(true);
    try {
      await reindexWorkspace();
      notifications.show({
        message: t("Reindex started. It runs in the background."),
      });
      setTimeout(() => refetch(), 1500);
    } catch {
      notifications.show({
        message: t("Failed to start reindex"),
        color: "red",
      });
    }
    setTriggering(false);
  };

  return (
    <>
      <Divider my="lg" />
      <Stack gap="xs">
        <Text fw={500}>{t("AI knowledge index")}</Text>
        <Text size="sm" c="dimmed">
          {t(
            "Rebuild embeddings for all existing pages so they can be answered by AI. Runs in the background.",
          )}
        </Text>

        <Group justify="space-between">
          <Text size="sm">
            {t("Indexed: {{indexed}} / {{total}} pages", {
              indexed: indexedPages,
              total: totalPages,
            })}
          </Text>
          <Text size="sm" c="dimmed">
            {pct}%
          </Text>
        </Group>
        <Progress value={pct} />

        <Group mt="xs">
          <Button loading={triggering} onClick={handleReindex}>
            {t("Rebuild index")}
          </Button>
        </Group>
      </Stack>
    </>
  );
}
