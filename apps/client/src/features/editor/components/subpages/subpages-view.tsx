import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Stack, Text, ActionIcon, Box } from "@mantine/core";
import { IconFileDescription } from "@tabler/icons-react";
import { useGetSidebarPagesQuery } from "@/features/page/queries/page-query";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import classes from "./subpages.module.css";
import styles from "../mention/mention.module.css";
import { useTranslation } from "react-i18next";
import { sortPositionKeys } from "@/features/page/tree/utils/utils";
import { useSharedPageSubpages } from "@/features/share/hooks/use-shared-page-subpages";
import { PagePreviewDrawer } from "../doc-database/page-preview-drawer";

export default function SubpagesView(props: NodeViewProps) {
  const { editor } = props;
  const { shareId } = useParams();
  const { t } = useTranslation();

  const currentPageId = editor.storage.pageId;

  // 预览页面状态
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);

  // Get subpages from shared tree if we're in a shared context
  const sharedSubpages = useSharedPageSubpages(currentPageId);

  const { data, isLoading, error } = useGetSidebarPagesQuery({
    pageId: currentPageId,
  });

  const subpages = useMemo(() => {
    // If we're in a shared context, use the shared subpages
    if (shareId && sharedSubpages) {
      return sharedSubpages.map((node) => ({
        id: node.value,
        slugId: node.slugId,
        title: node.name,
        icon: node.icon,
        position: node.position,
      }));
    }

    // Otherwise use the API data
    if (!data?.pages) return [];
    const allPages = data.pages.flatMap((page) => page.items);
    return sortPositionKeys(allPages);
  }, [data, shareId, sharedSubpages]);

  const handlePageClick = (pageId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPreviewPageId(pageId);
  };

  if (isLoading && !shareId) {
    return null;
  }

  if (error && !shareId) {
    return (
      <NodeViewWrapper data-drag-handle>
        <Text c="dimmed" size="md" py="md">
          {t("Failed to load subpages")}
        </Text>
      </NodeViewWrapper>
    );
  }

  if (subpages.length === 0) {
    return (
      <NodeViewWrapper data-drag-handle>
        <div className={classes.container}>
          <Text c="dimmed" size="md" py="md">
            {t("No subpages")}
          </Text>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper data-drag-handle>
      <div className={classes.container}>
        <Stack gap={5}>
          {subpages.map((page) => (
            <Box
              key={page.id}
              className={styles.pageMentionLink}
              style={{
                cursor: "pointer",
                fontWeight: 500,
              }}
              onClick={(e) => handlePageClick(page.id, e)}
            >
              {page?.icon ? (
                <span style={{ marginRight: "4px" }}>{page.icon}</span>
              ) : (
                <ActionIcon
                  variant="transparent"
                  color="gray"
                  component="span"
                  size={18}
                  style={{ verticalAlign: "text-bottom" }}
                >
                  <IconFileDescription size={18} />
                </ActionIcon>
              )}

              <span className={styles.pageMentionText}>
                {page?.title || t("untitled")}
              </span>
            </Box>
          ))}
        </Stack>
      </div>
      <PagePreviewDrawer
        pageId={previewPageId}
        onClose={() => setPreviewPageId(null)}
      />
    </NodeViewWrapper>
  );
}

