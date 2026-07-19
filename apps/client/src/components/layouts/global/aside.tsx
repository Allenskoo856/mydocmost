import { Box, Text } from "@mantine/core";
import CommentListWithTabs from "@/features/comment/components/comment-list-with-tabs.tsx";
import { useAtom } from "jotai";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useTranslation } from "react-i18next";

export default function Aside() {
  const [{ tab }] = useAtom(asideStateAtom);
  const { t } = useTranslation();

  if (tab !== "comments") {
    return null;
  }

  return (
    <Box p="md">
      <Text mb="md" fw={500}>
        {t("Comments")}
      </Text>
      <CommentListWithTabs />
    </Box>
  );
}
