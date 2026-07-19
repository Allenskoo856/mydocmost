import { ActionIcon, Box, Group, Text, Tooltip } from "@mantine/core";
import CommentListWithTabs from "@/features/comment/components/comment-list-with-tabs.tsx";
import { useAtom, useSetAtom } from "jotai";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import React, { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TableOfContents } from "@/features/editor/components/table-of-contents/table-of-contents.tsx";
import { useAtomValue } from "jotai";
import { pageEditorAtom } from "@/features/editor/atoms/editor-atoms.ts";
import { IconX } from "@tabler/icons-react";
import classes from "./aside.module.css";

export default function Aside() {
  const [{ tab, isAsideOpen }] = useAtom(asideStateAtom);
  const setAsideState = useSetAtom(asideStateAtom);
  const { t } = useTranslation();
  const pageEditor = useAtomValue(pageEditorAtom);

  let title: string;
  let component: ReactNode;

  switch (tab) {
    case "comments":
      component = <CommentListWithTabs />;
      title = "Comments";
      break;
    case "toc":
      component = <TableOfContents editor={pageEditor} />;
      title = "Table of contents";
      break;
    default:
      component = null;
      title = null;
  }

  if (!isAsideOpen || !component) {
    return null;
  }

  const isToc = tab === "toc";

  const handleClose = () => {
    setAsideState({ tab, isAsideOpen: false });
  };

  return (
    <Box className={isToc ? classes.tocAside : classes.commentsAside}>
      <Group
        justify="space-between"
        align="center"
        mb={isToc ? 6 : "md"}
        wrap="nowrap"
        className={isToc ? classes.tocHeader : undefined}
      >
        <Text fw={600} size={isToc ? "sm" : "md"} className={classes.title}>
          {t(title)}
        </Text>

        {isToc && (
          <Tooltip label={t("Close")} openDelay={250} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={handleClose}
              aria-label={t("Close table of contents")}
            >
              <IconX size={16} stroke={1.8} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      {isToc ? (
        <div className={classes.tocScrollArea}>{component}</div>
      ) : (
        component
      )}
    </Box>
  );
}
