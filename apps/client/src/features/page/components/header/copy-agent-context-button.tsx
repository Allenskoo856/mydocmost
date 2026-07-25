import { ActionIcon, Tooltip } from "@mantine/core";
import { IconRobot } from "@tabler/icons-react";
import { useParams } from "react-router-dom";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { extractPageSlugId } from "@/lib";
import { getAppUrl } from "@/lib/config.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import {
  buildAgentPageContext,
  getSelectedEditorText,
} from "@/features/search/commands/agent-context.ts";
import { copyTextToClipboard } from "@/lib/clipboard.ts";

/**
 * Header button that copies a compact page context (pageId / spaceId / URL +
 * any selected text) to the clipboard so it can be pasted into an external
 * Agent / MCP client. Uses the clipboard helper so it also works over plain
 * HTTP on intranet deployments.
 */
export default function CopyAgentContextButton() {
  const { t } = useTranslation();
  const { pageSlug, spaceSlug } = useParams();
  const { data: page } = usePageQuery({
    pageId: extractPageSlugId(pageSlug),
  });

  if (!page) {
    return null;
  }

  const handleCopy = async () => {
    const pageUrl =
      getAppUrl() + buildPageUrl(spaceSlug, page.slugId, page.title);
    const text = buildAgentPageContext({
      page,
      spaceSlug,
      pageUrl,
      selectedText: getSelectedEditorText(),
    });

    const copied = await copyTextToClipboard(text);
    notifications.show({
      message: copied
        ? t("Agent context copied")
        : t("Copy failed, please copy manually"),
      color: copied ? undefined : "red",
    });
  };

  return (
    <Tooltip label={t("Copy Agent context")} openDelay={250} withArrow>
      <ActionIcon
        variant="default"
        style={{ border: "none" }}
        onClick={handleCopy}
        aria-label={t("Copy Agent context")}
      >
        <IconRobot size={20} stroke={2} />
      </ActionIcon>
    </Tooltip>
  );
}
