import React from "react";
import { Drawer, Loader, Center, Text, Box, Container, ActionIcon, Group, CloseButton } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import PageEditor from "@/features/editor/page-editor";
import { usePageQuery } from "@/features/page/queries/page-query";
import { buildPageUrl } from "@/features/page/page.utils";
import { useTranslation } from "react-i18next";
import classes from "@/features/editor/styles/editor.module.css";

interface PagePreviewDrawerProps {
  pageId: string | null;
  onClose: () => void;
}

export function PagePreviewDrawer({ pageId, onClose }: PagePreviewDrawerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: page, isLoading, isError } = usePageQuery(
    { pageId: pageId || "" }
  );

  const handleNavigateToFullPage = () => {
    if (page) {
      const url = buildPageUrl(page.space?.slug || "", page.slugId, page.title);
      navigate(url);
      onClose();
    }
  };

  return (
    <Drawer.Root
      opened={!!pageId}
      onClose={onClose}
      position="right"
      size="50%"
    >
      <Drawer.Overlay backgroundOpacity={0.1} blur={0} />
      <Drawer.Content>
        <Drawer.Header style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
          <Drawer.Title>
            <Text size="sm" fw={500}>{page?.title || t("Page Preview")}</Text>
          </Drawer.Title>
          <Group gap={8}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              onClick={handleNavigateToFullPage}
              title="打开完整页面"
            >
              <IconArrowRight size={18} />
            </ActionIcon>
            <CloseButton onClick={onClose} />
          </Group>
        </Drawer.Header>
        <Drawer.Body style={{ padding: 0 }}>
          {isLoading ? (
            <Center h="100%">
              <Loader />
            </Center>
          ) : isError || !page ? (
            <Center h="100%">
              <Text c="dimmed">{t("Failed to load page")}</Text>
            </Center>
          ) : (
            <Box style={{ overflowY: "auto", height: "100%" }}>
              <Container size={900} className={classes.editor} style={{ minHeight: "100%" }}>
                <PageEditor
                  pageId={page.id}
                  spaceId={page.spaceId}
                  editable={false}
                  content={page.content}
                />
              </Container>
            </Box>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer.Root>
  );
}
