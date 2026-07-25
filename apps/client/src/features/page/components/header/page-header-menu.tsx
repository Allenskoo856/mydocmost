import { ActionIcon, Group, Menu, Text, Tooltip } from "@mantine/core";
import {
  IconArrowRight,
  IconArrowsHorizontal,
  IconDots,
  IconFileExport,
  IconHistory,
  IconLink,
  IconList,
  IconMessage,
  IconPrinter,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import React, { useEffect } from "react";
import useToggleAside from "@/hooks/use-toggle-aside.tsx";
import { useAtom } from "jotai";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { historyAtoms } from "@/features/page-history/atoms/history-atoms.ts";
import { getHotkeyHandler, useDisclosure, useHotkeys } from "@mantine/hooks";
import { useParams } from "react-router-dom";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { notifications } from "@mantine/notifications";
import { getAppUrl } from "@/lib/config.ts";
import { extractPageSlugId } from "@/lib";
import { treeApiAtom } from "@/features/page/tree/atoms/tree-api-atom.ts";
import { useDeletePageModal } from "@/features/page/hooks/use-delete-page-modal.tsx";
import { PageWidthToggle } from "@/features/user/components/page-width-pref.tsx";
import { Trans, useTranslation } from "react-i18next";
import ExportModal from "@/components/common/export-modal";
import {
  collabRetryRequestAtom,
  pageEditorAtom,
} from "@/features/editor/atoms/editor-atoms.ts";
import CollabStatusIndicator from "@/features/editor/components/collab-status-indicator";
import { searchAndReplaceStateAtom } from "@/features/editor/components/search-and-replace/atoms/search-and-replace-state-atom.ts";
import { formattedDate, timeAgo } from "@/lib/time.ts";
import { PageStateSegmentedControl } from "@/features/user/components/page-state-pref.tsx";
import MovePageModal from "@/features/page/components/move-page-modal.tsx";
import { useTimeAgo } from "@/hooks/use-time-ago.tsx";
import ShareModal from "@/features/share/components/share-modal.tsx";
import CopyAgentContextButton from "@/features/page/components/header/copy-agent-context-button.tsx";
import { copyTextToClipboard } from "@/lib/clipboard.ts";

interface PageHeaderMenuProps {
  readOnly?: boolean;
}
export default function PageHeaderMenu({ readOnly }: PageHeaderMenuProps) {
  const { t } = useTranslation();
  const toggleAside = useToggleAside();
  const [{ tab: asideTab, isAsideOpen }] = useAtom(asideStateAtom);
  const [, setCollabRetryRequest] = useAtom(collabRetryRequestAtom);
  const isTocOpen = isAsideOpen && asideTab === "toc";
  const isCommentsOpen = isAsideOpen && asideTab === "comments";

  useHotkeys(
    [
      [
        "mod+F",
        () => {
          const event = new CustomEvent("openFindDialogFromEditor", {});
          document.dispatchEvent(event);
        },
      ],
      [
        "Escape",
        () => {
          const event = new CustomEvent("closeFindDialogFromEditor", {});
          document.dispatchEvent(event);
        },
      ],
    ],
    [],
  );

  return (
    <>
      <CollabStatusIndicator
        onRetry={() => setCollabRetryRequest((n) => n + 1)}
      />

      {!readOnly && <PageStateSegmentedControl size="xs" />}

      <ShareModal readOnly={readOnly} />

      <CopyAgentContextButton />

      <Tooltip label={t("Comments")} openDelay={250} withArrow>
        <ActionIcon
          variant={isCommentsOpen ? "light" : "default"}
          style={{ border: "none" }}
          onClick={() => toggleAside("comments")}
          aria-pressed={isCommentsOpen}
        >
          <IconMessage size={20} stroke={2} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label={t("Table of contents")} openDelay={250} withArrow>
        <ActionIcon
          variant={isTocOpen ? "light" : "default"}
          style={{ border: "none" }}
          onClick={() => toggleAside("toc")}
          aria-pressed={isTocOpen}
        >
          <IconList size={20} stroke={2} />
        </ActionIcon>
      </Tooltip>

      <PageActionMenu readOnly={readOnly} />
    </>
  );
}

interface PageActionMenuProps {
  readOnly?: boolean;
}
function PageActionMenu({ readOnly }: PageActionMenuProps) {
  const { t } = useTranslation();
  const [, setHistoryModalOpen] = useAtom(historyAtoms);
  const { pageSlug, spaceSlug } = useParams();
  const { data: page, isLoading } = usePageQuery({
    pageId: extractPageSlugId(pageSlug),
  });
  const { openDeleteModal } = useDeletePageModal();
  const [tree] = useAtom(treeApiAtom);
  const [exportOpened, { open: openExportModal, close: closeExportModal }] =
    useDisclosure(false);
  const [
    movePageModalOpened,
    { open: openMovePageModal, close: closeMoveSpaceModal },
  ] = useDisclosure(false);
  const [pageEditor] = useAtom(pageEditorAtom);
  const pageUpdatedAt = useTimeAgo(page?.updatedAt);

  const handleCopyLink = async () => {
    const pageUrl =
      getAppUrl() + buildPageUrl(spaceSlug, page.slugId, page.title);

    const copied = await copyTextToClipboard(pageUrl);
    notifications.show({
      message: copied
        ? t("Link copied")
        : t("Copy failed, please copy manually"),
      color: copied ? undefined : "red",
    });
  };

  const handlePrint = () => {
    setTimeout(() => {
      window.print();
    }, 250);
  };

  const openHistoryModal = () => {
    setHistoryModalOpen(true);
  };

  const handleDeletePage = () => {
    openDeleteModal({ onConfirm: () => tree?.delete(page.id) });
  };

  // Command palette can open the same page modals without duplicating UI state.
  useEffect(() => {
    const markHandled = (event: Event) => {
      const custom = event as CustomEvent<{ handled?: boolean }>;
      if (custom.detail) {
        custom.detail.handled = true;
      }
      event.preventDefault();
    };
    const onExport = (event: Event) => {
      markHandled(event);
      openExportModal();
    };
    const onMove = (event: Event) => {
      markHandled(event);
      openMovePageModal();
    };
    const onDelete = (event: Event) => {
      markHandled(event);
      handleDeletePage();
    };
    document.addEventListener("openPageExportModal", onExport);
    document.addEventListener("openPageMoveModal", onMove);
    document.addEventListener("openPageDeleteModal", onDelete);
    return () => {
      document.removeEventListener("openPageExportModal", onExport);
      document.removeEventListener("openPageMoveModal", onMove);
      document.removeEventListener("openPageDeleteModal", onDelete);
    };
  }, [page?.id, tree]);

  return (
    <>
      <Menu
        shadow="xl"
        position="bottom-end"
        offset={20}
        width={230}
        withArrow
        arrowPosition="center"
      >
        <Menu.Target>
          <ActionIcon variant="default" style={{ border: "none" }}>
            <IconDots size={20} />
          </ActionIcon>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconLink size={16} />}
            onClick={handleCopyLink}
          >
            {t("Copy link")}
          </Menu.Item>
          <Menu.Divider />

          <Menu.Item leftSection={<IconArrowsHorizontal size={16} />}>
            <Group wrap="nowrap">
              <PageWidthToggle label={t("Full width")} />
            </Group>
          </Menu.Item>

          <Menu.Item
            leftSection={<IconHistory size={16} />}
            onClick={openHistoryModal}
          >
            {t("Page history")}
          </Menu.Item>

          <Menu.Divider />

          {!readOnly && (
            <Menu.Item
              leftSection={<IconArrowRight size={16} />}
              onClick={openMovePageModal}
            >
              {t("Move")}
            </Menu.Item>
          )}

          <Menu.Item
            leftSection={<IconFileExport size={16} />}
            onClick={openExportModal}
          >
            {t("Export")}
          </Menu.Item>

          <Menu.Item
            leftSection={<IconPrinter size={16} />}
            onClick={handlePrint}
          >
            {t("Print PDF")}
          </Menu.Item>

          {!readOnly && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={"red"}
                leftSection={<IconTrash size={16} />}
                onClick={handleDeletePage}
              >
                {t("Move to trash")}
              </Menu.Item>
            </>
          )}

          <Menu.Divider />

          <>
            <Group px="sm" wrap="nowrap" style={{ cursor: "pointer" }}>
              <Tooltip
                label={t("Edited by {{name}} {{time}}", {
                  name: page.lastUpdatedBy.name,
                  time: pageUpdatedAt,
                })}
                position="left-start"
              >
                <div style={{ width: 210 }}>
                  <Text size="xs" c="dimmed" truncate="end">
                    {t("Word count: {{wordCount}}", {
                      wordCount: pageEditor?.storage?.characterCount?.words(),
                    })}
                  </Text>

                  <Text size="xs" c="dimmed" lineClamp={1}>
                    <Trans
                      defaults="Created by: <b>{{creatorName}}</b>"
                      values={{ creatorName: page?.creator?.name }}
                      components={{ b: <Text span fw={500} /> }}
                    />
                  </Text>
                  <Text size="xs" c="dimmed" truncate="end">
                    {t("Created at: {{time}}", {
                      time: formattedDate(page.createdAt),
                    })}
                  </Text>
                </div>
              </Tooltip>
            </Group>
          </>
        </Menu.Dropdown>
      </Menu>

      <ExportModal
        type="page"
        id={page.id}
        open={exportOpened}
        onClose={closeExportModal}
      />

      <MovePageModal
        pageId={page.id}
        slugId={page.slugId}
        currentSpaceSlug={spaceSlug}
        onClose={closeMoveSpaceModal}
        open={movePageModalOpened}
      />
    </>
  );
}
