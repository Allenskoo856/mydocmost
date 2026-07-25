import classes from "./page-header.module.css";
import PageHeaderMenu from "@/features/page/components/header/page-header-menu.tsx";
import PagePresenceAvatars from "@/features/page/components/header/page-presence-avatars.tsx";
import { Button, Group, Tooltip } from "@mantine/core";
import { IconEdit } from "@tabler/icons-react";
import Breadcrumb from "@/features/page/components/breadcrumbs/breadcrumb.tsx";
import { useAtom } from "jotai";
import {
  desktopSidebarAtom,
  mobileSidebarAtom,
} from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import SidebarToggle from "@/components/ui/sidebar-toggle-button.tsx";
import { useTranslation } from "react-i18next";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import { PageEditMode } from "@/features/user/types/user.types.ts";
import { pageForceEditAtom } from "@/features/editor/atoms/editor-atoms.ts";
import { isLargeDocumentSize } from "@/features/editor/utils/large-document";

interface Props {
  readOnly?: boolean;
  contentSize?: number;
}
export default function PageHeader({ readOnly, contentSize }: Props) {
  const { t } = useTranslation();
  const [mobileOpened] = useAtom(mobileSidebarAtom);
  const toggleMobile = useToggleSidebar(mobileSidebarAtom);
  const [desktopOpened] = useAtom(desktopSidebarAtom);
  const toggleDesktop = useToggleSidebar(desktopSidebarAtom);
  const [currentUser] = useAtom(currentUserAtom);
  const [forceEdit, setForceEdit] = useAtom(pageForceEditAtom);
  const userPageEditMode =
    currentUser?.user?.settings?.preferences?.pageEditMode ?? PageEditMode.Edit;
  const isLargeDocument = isLargeDocumentSize(contentSize);
  // In static read mode (read preference or large document) with edit
  // permission, offer an explicit switch to the full collaborative editor.
  const showEditButton =
    !readOnly &&
    !forceEdit &&
    (userPageEditMode === PageEditMode.Read || isLargeDocument);

  return (
    <div className={classes.header}>
      <Group
        justify="space-between"
        h="100%"
        px="md"
        wrap="nowrap"
        className={classes.group}
      >
        <Group wrap="nowrap" gap="var(--mantine-spacing-xs)">
          {!mobileOpened && (
            <Tooltip label={t("Sidebar toggle")}>
              <SidebarToggle
                aria-label={t("Sidebar toggle")}
                opened={mobileOpened}
                onClick={toggleMobile}
                hiddenFrom="sm"
                size="sm"
              />
            </Tooltip>
          )}

          {!desktopOpened && (
            <Tooltip label={t("Sidebar toggle")}>
              <SidebarToggle
                aria-label={t("Sidebar toggle")}
                opened={desktopOpened}
                onClick={toggleDesktop}
                visibleFrom="sm"
                size="sm"
              />
            </Tooltip>
          )}

          <Breadcrumb />
        </Group>

        <Group
          justify="flex-end"
          h="100%"
          px="md"
          wrap="nowrap"
          gap="var(--mantine-spacing-xs)"
        >
          <PagePresenceAvatars />
          {showEditButton && (
            <Button
              size="compact-sm"
              variant="light"
              leftSection={<IconEdit size={16} />}
              onClick={() => setForceEdit(true)}
            >
              {t("Edit")}
            </Button>
          )}
          <PageHeaderMenu readOnly={readOnly} />
        </Group>
      </Group>
    </div>
  );
}
