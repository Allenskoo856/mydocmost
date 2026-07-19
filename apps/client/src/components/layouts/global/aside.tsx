import { Box, Text } from "@mantine/core";
import CommentListWithTabs from "@/features/comment/components/comment-list-with-tabs.tsx";
import { useAtom } from "jotai";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useTranslation } from "react-i18next";
import classes from "./aside.module.css";

export default function Aside() {
  const [{ tab, isAsideOpen }] = useAtom(asideStateAtom);
  const { t } = useTranslation();

  if (!isAsideOpen || tab !== "comments") {
    return null;
  }

  return (
    <Box className={classes.commentsAside}>
      <Text mb="md" fw={500}>
        {t("Comments")}
      </Text>
      <CommentListWithTabs />
    </Box>
  );
}
