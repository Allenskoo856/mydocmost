import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAtom } from "jotai";
import { useClipboard } from "@mantine/hooks";
import { useMantineColorScheme } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  IconEdit,
  IconFilePlus,
  IconHistory,
  IconHome,
  IconLink,
  IconList,
  IconMessage,
  IconRobot,
  IconSearch,
  IconSettings,
  IconSpaces,
  IconLayoutSidebar,
  IconMoon,
  IconSun,
  IconFileExport,
  IconArrowRight,
  IconTrash,
} from "@tabler/icons-react";
import { createElement } from "react";
import useToggleAside from "@/hooks/use-toggle-aside";
import {
  desktopSidebarAtom,
  mobileSidebarAtom,
} from "@/components/layouts/global/hooks/atoms/sidebar-atom";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar";
import { historyAtoms } from "@/features/page-history/atoms/history-atoms";
import { pageForceEditAtom } from "@/features/editor/atoms/editor-atoms";
import {
  useCreatePageMutation,
  usePageQuery,
} from "@/features/page/queries/page-query";
import { buildPageUrl } from "@/features/page/page.utils";
import { extractPageSlugId } from "@/lib";
import { getAppUrl } from "@/lib/config";
import {
  buildAgentPageContext,
  getSelectedEditorText,
} from "@/features/search/commands/agent-context";
import type { CommandPaletteItem } from "@/features/search/commands/types";

function icon(node: React.ReactNode) {
  return node;
}

/**
 * Fire a page command event and surface a toast when no page-header listener
 * is currently mounted (read-only shells, early mount, etc.).
 */
function dispatchPageCommand(
  eventName: string,
  unavailableMessage: string,
): void {
  const detail = { handled: false };
  document.dispatchEvent(
    new CustomEvent(eventName, {
      cancelable: true,
      detail,
    }),
  );
  // Listeners set detail.handled = true synchronously when mounted.
  if (!detail.handled) {
    notifications.show({
      message: unavailableMessage,
      color: "yellow",
    });
  }
}

export function useCommandPaletteActions(): CommandPaletteItem[] {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pageSlug, spaceSlug } = useParams();
  const slugId = pageSlug ? extractPageSlugId(pageSlug) : undefined;
  const { data: page } = usePageQuery({ pageId: slugId });
  const createPageMutation = useCreatePageMutation();
  const clipboard = useClipboard({ timeout: 500 });
  const toggleAside = useToggleAside();
  const toggleDesktopSidebar = useToggleSidebar(desktopSidebarAtom);
  const toggleMobileSidebar = useToggleSidebar(mobileSidebarAtom);
  const [, setHistoryModalOpen] = useAtom(historyAtoms);
  const [, setForceEdit] = useAtom(pageForceEditAtom);
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  const onPage = Boolean(page?.id && spaceSlug);

  return useMemo(() => {
    const pageUrl =
      onPage && page
        ? getAppUrl() + buildPageUrl(spaceSlug, page.slugId, page.title)
        : "";

    const commands: CommandPaletteItem[] = [
      {
        id: "copy-page-link",
        label: t("Copy link"),
        description: t("Copy the current page URL"),
        keywords: ["link", "url", "share", "复制链接"],
        group: "page",
        enabled: onPage,
        icon: icon(createElement(IconLink, { size: 16 })),
        perform: () => {
          clipboard.copy(pageUrl);
          notifications.show({ message: t("Link copied") });
        },
      },
      {
        id: "copy-agent-context",
        label: t("Copy Agent context"),
        description: t("Copy pageId, spaceId and URL for MCP / Agent tools"),
        keywords: [
          "agent",
          "mcp",
          "context",
          "pageId",
          "spaceId",
          "复制上下文",
          "参数",
        ],
        group: "agent",
        enabled: onPage,
        icon: icon(createElement(IconRobot, { size: 16 })),
        perform: () => {
          const text = buildAgentPageContext({
            page,
            spaceSlug,
            pageUrl,
            selectedText: getSelectedEditorText(),
          });
          clipboard.copy(text);
          notifications.show({ message: t("Agent context copied") });
        },
      },
      {
        id: "switch-to-edit",
        label: t("Switch to edit mode"),
        description: t("Open the collaborative editor for this page"),
        keywords: ["edit", "write", "编辑"],
        group: "page",
        enabled: onPage,
        icon: icon(createElement(IconEdit, { size: 16 })),
        perform: () => setForceEdit(true),
      },
      {
        id: "find-in-page",
        label: t("Find in page"),
        description: t("Search and replace in the current document"),
        keywords: ["find", "replace", "查找", "替换"],
        group: "page",
        shortcut: "Mod+F",
        enabled: onPage,
        icon: icon(createElement(IconSearch, { size: 16 })),
        perform: () => {
          document.dispatchEvent(
            new CustomEvent("openFindDialogFromEditor", {}),
          );
        },
      },
      {
        id: "toggle-comments",
        label: t("Toggle comments"),
        keywords: ["comments", "评论"],
        group: "page",
        enabled: onPage,
        icon: icon(createElement(IconMessage, { size: 16 })),
        perform: () => toggleAside("comments"),
      },
      {
        id: "toggle-toc",
        label: t("Toggle table of contents"),
        keywords: ["toc", "outline", "目录"],
        group: "page",
        enabled: onPage,
        icon: icon(createElement(IconList, { size: 16 })),
        perform: () => toggleAside("toc"),
      },
      {
        id: "page-history",
        label: t("Page history"),
        keywords: ["history", "versions", "历史", "版本"],
        group: "page",
        enabled: onPage,
        icon: icon(createElement(IconHistory, { size: 16 })),
        perform: () => setHistoryModalOpen(true),
      },
      {
        id: "create-child-page",
        label: t("New child page"),
        description: t("Create a sub-page under the current page"),
        keywords: ["new", "create", "child", "subpage", "新建", "子页面"],
        group: "page",
        enabled: onPage && Boolean(page?.spaceId),
        icon: icon(createElement(IconFilePlus, { size: 16 })),
        perform: async () => {
          if (!page?.spaceId) return;
          // Prefer the API mutation over tree.create(): arborist create fails when
          // parent children are not loaded yet, while invalidateOnCreatePage keeps
          // the sidebar in sync.
          const created = await createPageMutation.mutateAsync({
            spaceId: page.spaceId,
            parentPageId: page.id,
          } as any);
          navigate(buildPageUrl(spaceSlug, created.slugId, created.title));
        },
      },
      {
        id: "export-page",
        label: t("Export page"),
        keywords: ["export", "markdown", "导出"],
        group: "page",
        enabled: onPage,
        icon: icon(createElement(IconFileExport, { size: 16 })),
        perform: () => {
          dispatchPageCommand(
            "openPageExportModal",
            t("Page action is unavailable on this screen"),
          );
        },
      },
      {
        id: "move-page",
        label: t("Move page"),
        keywords: ["move", "移动"],
        group: "page",
        enabled: onPage,
        icon: icon(createElement(IconArrowRight, { size: 16 })),
        perform: () => {
          dispatchPageCommand(
            "openPageMoveModal",
            t("Page action is unavailable on this screen"),
          );
        },
      },
      {
        id: "trash-page",
        label: t("Move to trash"),
        keywords: ["delete", "trash", "删除", "回收站"],
        group: "page",
        enabled: onPage,
        icon: icon(createElement(IconTrash, { size: 16 })),
        perform: () => {
          dispatchPageCommand(
            "openPageDeleteModal",
            t("Page action is unavailable on this screen"),
          );
        },
      },
      {
        id: "go-home",
        label: t("Go to home"),
        keywords: ["home", "dashboard", "首页"],
        group: "navigation",
        icon: icon(createElement(IconHome, { size: 16 })),
        perform: () => navigate("/home"),
      },
      {
        id: "go-spaces",
        label: t("Go to spaces"),
        keywords: ["spaces", "空间"],
        group: "navigation",
        icon: icon(createElement(IconSpaces, { size: 16 })),
        perform: () => navigate("/spaces"),
      },
      {
        id: "go-settings",
        label: t("Open settings"),
        keywords: ["settings", "preferences", "设置"],
        group: "navigation",
        icon: icon(createElement(IconSettings, { size: 16 })),
        perform: () => navigate("/settings/account/preferences"),
      },
      {
        id: "toggle-sidebar",
        label: t("Toggle sidebar"),
        keywords: ["sidebar", "侧栏"],
        group: "navigation",
        icon: icon(createElement(IconLayoutSidebar, { size: 16 })),
        perform: () => {
          // Prefer desktop toggle; mobile shell also listens to the same pattern.
          if (window.innerWidth < 768) {
            toggleMobileSidebar();
          } else {
            toggleDesktopSidebar();
          }
        },
      },
      {
        id: "toggle-theme",
        label:
          colorScheme === "dark" ? t("Switch to light mode") : t("Switch to dark mode"),
        keywords: ["theme", "dark", "light", "主题", "暗色", "亮色"],
        group: "navigation",
        icon: icon(
          createElement(colorScheme === "dark" ? IconSun : IconMoon, {
            size: 16,
          }),
        ),
        perform: () =>
          setColorScheme(colorScheme === "dark" ? "light" : "dark"),
      },
    ];

    return commands.filter((command) => command.enabled !== false);
  }, [
    t,
    navigate,
    onPage,
    page,
    spaceSlug,
    clipboard,
    toggleAside,
    setHistoryModalOpen,
    setForceEdit,
    createPageMutation,
    colorScheme,
    setColorScheme,
    toggleDesktopSidebar,
    toggleMobileSidebar,
  ]);
}

export function filterCommands(
  commands: CommandPaletteItem[],
  query: string,
): CommandPaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return commands;
  }

  return commands.filter((command) => {
    const haystack = [
      command.label,
      command.description ?? "",
      ...(command.keywords ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
